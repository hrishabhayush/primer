import { Router, Request, Response } from 'express';
import { WalletTrackingService } from '../services/WalletTrackingService';

const router: Router = Router();

let walletTrackingService: WalletTrackingService;

export const setWalletTrackingService = (service: WalletTrackingService) => {
  walletTrackingService = service;
};

/**
 * GET /api/wallet/:address/activity
 * Get wallet activity for a specific address
 */
router.get('/:address/activity', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = '20' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`🔍 Getting activity for wallet: ${address}`);

    const activity = await walletTrackingService.getWalletActivity(address);

    return res.json({
      success: true,
      activity,
      limit: parseInt(limit as string)
    });

  } catch (error) {
    console.error('❌ Error getting wallet activity:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet activity'
    });
  }
});

/**
 * GET /api/wallet/:address/transactions
 * Get recent transactions for a wallet
 */
router.get('/:address/transactions', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { token = 'all', limit = '10' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`🔍 Getting transactions for wallet: ${address}, token: ${token}`);

    let transactions = [];

    if (token === 'usdc' || token === 'all') {
      const usdcTransactions = await walletTrackingService.trackUSDCTransfers(address, parseInt(limit as string));
      transactions.push(...usdcTransactions);
    }

    if (token === 'eth' || token === 'all') {
      const ethTransactions = await walletTrackingService.trackETHTransfers(address, parseInt(limit as string));
      transactions.push(...ethTransactions);
    }

    // Sort by block number (most recent first)
    transactions.sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber));

    return res.json({
      success: true,
      walletAddress: address,
      transactions: transactions.slice(0, parseInt(limit as string)),
      count: transactions.length
    });

  } catch (error) {
    console.error('❌ Error getting wallet transactions:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet transactions'
    });
  }
});

/**
 * GET /api/wallet/:address/balance
 * Get approximate wallet balance
 */
router.get('/:address/balance', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`💰 Getting balance for wallet: ${address}`);

    const balance = await walletTrackingService.getWalletBalance(address);

    return res.json({
      success: true,
      walletAddress: address,
      balance,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting wallet balance:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet balance'
    });
  }
});

/**
 * GET /api/wallet/:address/recent-activity
 * Check if wallet has recent activity (for payment verification)
 */
router.get('/:address/recent-activity', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { minutes = '5' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`⏰ Checking recent activity for wallet: ${address} (last ${minutes} minutes)`);

    const hasActivity = await walletTrackingService.hasRecentActivity(address, parseInt(minutes as string));

    return res.json({
      success: true,
      walletAddress: address,
      hasRecentActivity: hasActivity,
      timeWindow: `${minutes} minutes`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error checking recent activity:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check recent activity'
    });
  }
});

/**
 * GET /api/wallet/:address/stored-activity
 * Get stored wallet activity from database
 */
router.get('/:address/stored-activity', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = '50' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`💾 Getting stored activity for wallet: ${address}`);

    const transactions = await walletTrackingService.getStoredWalletActivity(address, parseInt(limit as string));

    return res.json({
      success: true,
      walletAddress: address,
      transactions,
      count: transactions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting stored activity:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stored activity'
    });
  }
});

/**
 * POST /api/wallet/verify-payment
 * Verify if a payment was made to a specific address
 */
router.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    const { fromAddress, toAddress, amount, token = 'USDC', minutes = 5 } = req.body;

    if (!fromAddress || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fromAddress, toAddress, and amount are required'
      });
    }

    console.log(`🔍 Verifying payment: ${fromAddress} → ${toAddress} (${amount} ${token})`);

    // Get recent activity for the sender
    const activity = await walletTrackingService.getWalletActivity(fromAddress);
    
    // Look for matching transaction
    const matchingTransaction = activity.transactions.find(tx => {
      const txAmount = parseFloat(tx.value) / Math.pow(10, tx.token === 'USDC' ? 6 : 18);
      const targetAmount = parseFloat(amount);
      
      return tx.token === token &&
             tx.to.toLowerCase() === toAddress.toLowerCase() &&
             Math.abs(txAmount - targetAmount) < 0.01; // Allow small difference for gas fees
    });

    if (matchingTransaction) {
      return res.json({
        success: true,
        paymentVerified: true,
        transaction: matchingTransaction,
        message: 'Payment verified successfully'
      });
    }

    // Check if there's recent activity but no matching transaction
    const hasRecentActivity = await walletTrackingService.hasRecentActivity(fromAddress, minutes);
    
    return res.json({
      success: true,
      paymentVerified: false,
      hasRecentActivity,
      message: hasRecentActivity ? 'Recent activity found but no matching payment' : 'No recent activity found'
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify payment'
    });
  }
});

/**
 * GET /api/wallet/test
 * Test endpoint for wallet tracking functionality
 */
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Wallet tracking endpoints are working!',
    endpoints: {
      'GET /api/wallet/:address/activity': 'Get comprehensive wallet activity',
      'GET /api/wallet/:address/transactions': 'Get recent transactions',
      'GET /api/wallet/:address/balance': 'Get wallet balance',
      'GET /api/wallet/:address/recent-activity': 'Check for recent activity',
      'GET /api/wallet/:address/stored-activity': 'Get stored activity from database',
      'POST /api/wallet/verify-payment': 'Verify a payment transaction',
      'GET /api/wallet/test': 'This endpoint - test wallet tracking functionality'
    },
    exampleUsage: {
      activity: 'GET /api/wallet/0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6/activity',
      transactions: 'GET /api/wallet/0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6/transactions?token=usdc&limit=10',
      balance: 'GET /api/wallet/0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6/balance',
      verifyPayment: {
        method: 'POST',
        url: '/api/wallet/verify-payment',
        body: {
          fromAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
          toAddress: '0xAF5BE3C059aacBBbD23522B3cFc892313d1B47D5',
          amount: '25.50',
          token: 'USDC',
          minutes: 5
        }
      }
    }
  });
});

export default router;
