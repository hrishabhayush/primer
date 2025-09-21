/**
 * Wallet Balance Service for Extension
 * Checks USDC balance and Base ETH balance for gas fees
 */

// Extend Window interface to include ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface BalanceInfo {
  usdcBalance: string;
  ethBalance: string;
  usdcBalanceUSD: string;
  ethBalanceUSD: string;
  hasSufficientUSDC: boolean;
  hasSufficientETH: boolean;
  estimatedGasFee: string;
  estimatedGasFeeUSD: string;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  totalFee: string;
  totalFeeUSD: string;
}

export class WalletBalanceService {
  private baseNetworkId = 8453; // Base mainnet
  private usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
  private ethPriceUSD = 2000; // Mock ETH price, in production this would be fetched from an oracle

  /**
   * Check if wallet is connected and on correct network
   */
  async checkWalletConnection(): Promise<{ connected: boolean; networkId?: number; address?: string }> {
    try {
      if (typeof window.ethereum === 'undefined') {
        return { connected: false };
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        return { connected: false };
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const networkId = parseInt(chainId, 16);

      return {
        connected: true,
        networkId,
        address: accounts[0]
      };
    } catch (error) {
      console.error('❌ Error checking wallet connection:', error);
      return { connected: false };
    }
  }

  /**
   * Get USDC balance for a wallet address
   */
  async getUSDCBalance(walletAddress: string): Promise<string> {
    try {
      console.log('💰 Getting USDC balance for:', walletAddress);

      // USDC contract ABI (minimal for balanceOf)
      const abi = [
        {
          "constant": true,
          "inputs": [{"name": "_owner", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "balance", "type": "uint256"}],
          "type": "function"
        }
      ];

      // Create contract instance
      const contract = new (window as any).ethers.Contract(
        this.usdcContractAddress,
        abi,
        (window as any).ethers.providers.getDefaultProvider()
      );

      const balance = await contract.balanceOf(walletAddress);
      const balanceInUSDC = (window as any).ethers.utils.formatUnits(balance, 6); // USDC has 6 decimals

      console.log('✅ USDC balance:', balanceInUSDC);
      return balanceInUSDC;

    } catch (error) {
      console.error('❌ Error getting USDC balance:', error);
      return '0';
    }
  }

  /**
   * Get Base ETH balance for a wallet address
   */
  async getETHBalance(walletAddress: string): Promise<string> {
    try {
      console.log('⛽ Getting ETH balance for:', walletAddress);

      const provider = (window as any).ethers.providers.getDefaultProvider();
      const balance = await provider.getBalance(walletAddress);
      const balanceInETH = (window as any).ethers.utils.formatEther(balance);

      console.log('✅ ETH balance:', balanceInETH);
      return balanceInETH;

    } catch (error) {
      console.error('❌ Error getting ETH balance:', error);
      return '0';
    }
  }

  /**
   * Estimate gas fees for a USDC transfer
   */
  async estimateGasFees(
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<GasEstimate> {
    try {
      console.log('⛽ Estimating gas fees for USDC transfer...', {
        fromAddress,
        toAddress,
        amount
      });

      // USDC contract ABI for transfer
      const abi = [
        {
          "constant": false,
          "inputs": [
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"}
          ],
          "name": "transfer",
          "outputs": [{"name": "", "type": "bool"}],
          "type": "function"
        }
      ];

      const provider = (window as any).ethers.providers.getDefaultProvider();
      const contract = new (window as any).ethers.Contract(
        this.usdcContractAddress,
        abi,
        provider
      );

      // Convert amount to USDC units (6 decimals)
      const amountInUnits = (window as any).ethers.utils.parseUnits(amount, 6);

      // Estimate gas
      const gasEstimate = await contract.estimateGas.transfer(toAddress, amountInUnits);
      const gasPrice = await provider.getGasPrice();

      const gasLimit = gasEstimate.toString();
      const gasPriceGwei = (window as any).ethers.utils.formatUnits(gasPrice, 'gwei');
      const totalFee = gasEstimate.mul(gasPrice);
      const totalFeeETH = (window as any).ethers.utils.formatEther(totalFee);
      const totalFeeUSD = (parseFloat(totalFeeETH) * this.ethPriceUSD).toFixed(4);

      const estimate: GasEstimate = {
        gasLimit,
        gasPrice: gasPriceGwei,
        totalFee: totalFeeETH,
        totalFeeUSD
      };

      console.log('✅ Gas estimate:', estimate);
      return estimate;

    } catch (error) {
      console.error('❌ Error estimating gas fees:', error);
      
      // Return default estimate if estimation fails
      return {
        gasLimit: '100000',
        gasPrice: '0.000000001',
        totalFee: '0.0001',
        totalFeeUSD: '0.20'
      };
    }
  }

  /**
   * Get comprehensive balance information
   */
  async getBalanceInfo(walletAddress: string, orderAmount: string): Promise<BalanceInfo> {
    try {
      console.log('💳 Getting comprehensive balance info...', {
        walletAddress,
        orderAmount
      });

      // Get balances
      const [usdcBalance, ethBalance] = await Promise.all([
        this.getUSDCBalance(walletAddress),
        this.getETHBalance(walletAddress)
      ]);

      // Estimate gas fees
      const gasEstimate = await this.estimateGasFees(
        walletAddress,
        '0xAF5BE3C059aacBBbD23522B3cFc892313d1B47D5', // Merchant address
        orderAmount
      );

      // Convert to numbers for comparison
      const usdcBalanceNum = parseFloat(usdcBalance);
      const ethBalanceNum = parseFloat(ethBalance);
      const orderAmountNum = parseFloat(orderAmount);
      const gasFeeNum = parseFloat(gasEstimate.totalFeeUSD);

      // Check if sufficient
      const hasSufficientUSDC = usdcBalanceNum >= orderAmountNum;
      const hasSufficientETH = ethBalanceNum >= parseFloat(gasEstimate.totalFee);

      const balanceInfo: BalanceInfo = {
        usdcBalance,
        ethBalance,
        usdcBalanceUSD: (usdcBalanceNum * 1).toFixed(2), // USDC is 1:1 with USD
        ethBalanceUSD: (ethBalanceNum * this.ethPriceUSD).toFixed(2),
        hasSufficientUSDC,
        hasSufficientETH,
        estimatedGasFee: gasEstimate.totalFee,
        estimatedGasFeeUSD: gasEstimate.totalFeeUSD
      };

      console.log('✅ Balance info:', balanceInfo);
      return balanceInfo;

    } catch (error) {
      console.error('❌ Error getting balance info:', error);
      
      // Return default values on error
      return {
        usdcBalance: '0',
        ethBalance: '0',
        usdcBalanceUSD: '0',
        ethBalanceUSD: '0',
        hasSufficientUSDC: false,
        hasSufficientETH: false,
        estimatedGasFee: '0.0001',
        estimatedGasFeeUSD: '0.20'
      };
    }
  }

  /**
   * Check if user can complete the transaction
   */
  async canCompleteTransaction(walletAddress: string, orderAmount: string): Promise<{
    canComplete: boolean;
    reason?: string;
    balanceInfo: BalanceInfo;
  }> {
    try {
      const balanceInfo = await this.getBalanceInfo(walletAddress, orderAmount);

      if (!balanceInfo.hasSufficientUSDC) {
        return {
          canComplete: false,
          reason: 'Insufficient USDC balance',
          balanceInfo
        };
      }

      if (!balanceInfo.hasSufficientETH) {
        return {
          canComplete: false,
          reason: 'Insufficient Base ETH for gas fees',
          balanceInfo
        };
      }

      return {
        canComplete: true,
        balanceInfo
      };

    } catch (error) {
      console.error('❌ Error checking transaction completion:', error);
      
      return {
        canComplete: false,
        reason: 'Failed to check balances',
        balanceInfo: {
          usdcBalance: '0',
          ethBalance: '0',
          usdcBalanceUSD: '0',
          ethBalanceUSD: '0',
          hasSufficientUSDC: false,
          hasSufficientETH: false,
          estimatedGasFee: '0.0001',
          estimatedGasFeeUSD: '0.20'
        }
      };
    }
  }

  /**
   * Wait for balance update with retry
   */
  async waitForBalanceUpdate(
    walletAddress: string,
    expectedUSDC: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<boolean> {
    console.log('⏳ Waiting for balance update...', { expectedUSDC });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

      try {
        const balance = await this.getUSDCBalance(walletAddress);
        const balanceNum = parseFloat(balance);
        const expectedNum = parseFloat(expectedUSDC);

        if (balanceNum >= expectedNum) {
          console.log('✅ Balance updated successfully:', balance);
          return true;
        }

        console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Current balance ${balance}, waiting...`);

      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed:`, error);
      }
    }

    console.log('⏰ Balance update timeout');
    return false;
  }
}

// Export singleton instance
export const walletBalanceService = new WalletBalanceService();
