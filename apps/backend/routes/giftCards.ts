import express from 'express';
import { AmazonGiftCardService } from '../services/AmazonGiftCardService';

const router = express.Router();
const amazonGiftCardService = new AmazonGiftCardService();

/**
 * POST /api/gift-cards/create
 * Creates a new Amazon gift card
 */
router.post('/create', async (req, res) => {
  try {
    const { amount, currencyCode = 'USD' } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount. Must be a positive number.'
      });
    }

    console.log(`🎁 Creating gift card for $${amount} ${currencyCode}`);

    const result = await amazonGiftCardService.createGiftCard(amount, currencyCode);

    if (result.statusCode === 'SUCCESS' && result.gcClaimCode) {
      res.json({
        success: true,
        giftCard: {
          claimCode: result.gcClaimCode,
          gcId: result.gcId,
          amount: amount,
          currencyCode: currencyCode,
          creationRequestId: result.creationRequestId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message || 'Failed to create gift card',
        errorCode: result.errorCode
      });
    }

  } catch (error) {
    console.error('❌ Error creating gift card:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/gift-cards/test
 * Tests the Amazon API connection
 */
router.post('/test', async (req, res) => {
  try {
    console.log('🧪 Testing Amazon Gift Card API connection...');
    const isConnected = await amazonGiftCardService.testConnection();
    
    res.json({
      success: isConnected,
      message: isConnected ? 'API connection successful' : 'API connection failed'
    });
  } catch (error) {
    console.error('❌ Error testing API connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;