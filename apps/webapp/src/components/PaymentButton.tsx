import React, { useState, useEffect } from 'react';
import { useConnect, useSendTransaction, useWaitForTransactionReceipt, useAccount, useDisconnect, useSwitchChain, useEstimateGas, useWriteContract } from 'wagmi';
import { coinbaseWallet } from 'wagmi/connectors';
import { parseUnits, encodeFunctionData } from 'viem';
import { base } from 'wagmi/chains';
import styles from '../styles/Home.module.css';

// 🆕 ON RAMP INTEGRATION: Add On Ramp functionality for insufficient Base ETH
interface OnrampQuoteResponse {
  coinbaseFee: { currency: string; value: string };
  networkFee: { currency: string; value: string };
  onrampUrl: string;
  paymentSubtotal: { currency: string; value: string };
  paymentTotal: { currency: string; value: string };
  purchaseAmount: { currency: string; value: string };
  quoteId: string;
}

// USDC contract address on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ERC20 ABI for transfer function
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  }
] as const;

interface PaymentButtonProps {
  amount: number; // USD amount to convert to USDC
  merchantAddress: `0x${string}`;
  onPaymentSuccess?: (txHash: string) => void;
  onPaymentError?: (error: Error) => void;
  onShowCongratulation?: (txHash: string) => void;
  disabled?: boolean;
  className?: string;
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  amount, // USD amount to convert to USDC
  merchantAddress,
  onPaymentSuccess,
  onPaymentError,
  onShowCongratulation,
  disabled = false,
  className = ''
}) => {
  // Convert USD amount to USDC (1 USD = 1 USDC)
  const usdcAmountFromUSD = amount;
  const [isDisabled, setIsDisabled] = useState(disabled);
  const [error, setError] = useState<Error | null>(null);
  
  // 🆕 ON RAMP STATE
  const [showOnrampButton, setShowOnrampButton] = useState(false);
  const [isOnrampLoading, setIsOnrampLoading] = useState(false);
  const [onrampQuote, setOnrampQuote] = useState<OnrampQuoteResponse | null>(null);
  
  // Wagmi hooks
  const { connect, isPending: isConnecting } = useConnect();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending: isSending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  
  // USDC amount calculation
  const usdcAmount = parseUnits(usdcAmountFromUSD.toString(), 6); // USDC has 6 decimals

  // Transaction state
  const [txHash, setTxHash] = useState<string>('');
  const [isPostVerificationProcessing, setIsPostVerificationProcessing] = useState(false);

  // Update disabled state based on props and processing state
  useEffect(() => {
    setIsDisabled(disabled || isSending || isConfirming || isPostVerificationProcessing);
  }, [disabled, isSending, isConfirming, isPostVerificationProcessing]);

  // Update transaction hash when available
  useEffect(() => {
    if (hash) {
      setTxHash(hash);
    }
  }, [hash]);

  // Check for send transaction errors
  useEffect(() => {
    if (hash) {
      console.log('Transaction hash:', hash);
      onPaymentSuccess?.(hash);
    }
  }, [hash, onPaymentSuccess]);

  // Remove gas error handling - let the transaction handle gas automatically

  // Check for transaction confirmation and show congratulation page
  useEffect(() => {
    if (isSuccess && hash) {
      console.log('Transaction confirmed!');
      setIsPostVerificationProcessing(true);
      
      // Store wallet address for payment monitoring
      if (address) {
        localStorage.setItem('stablecart_user_wallet', address);
        localStorage.setItem('stablecart_payment_completed', 'true');
        console.log('💾 Stored wallet address for payment monitoring:', address);
      }
      
      // Create Amazon gift card after successful payment
      createAmazonGiftCard(hash);
      
      // Show processing state for 1.5 seconds, then show congratulation page
      setTimeout(() => {
        onShowCongratulation?.(hash);
      }, 1500);
    }
  }, [isSuccess, hash, address, onShowCongratulation]);

  // Create Amazon gift card function
  const createAmazonGiftCard = async (txHash: string) => {
    try {
      console.log('🎁 Creating Amazon gift card for $0.01...');
      
      const response = await fetch('http://localhost:3001/api/gift-cards/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 0.01,
          currencyCode: 'USD'
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.giftCard) {
          console.log('✅ Amazon gift card created successfully:', result.giftCard.claimCode);
          console.log('🎫 Gift card details:', result.giftCard);
          
          // Store the gift card code for later use
          localStorage.setItem('latest_gift_card', JSON.stringify({
            claimCode: result.giftCard.claimCode,
            amount: result.giftCard.amount,
            transactionHash: txHash,
            createdAt: new Date().toISOString()
          }));
          
          // Show success message with gift card code
          alert(`🎉 Payment successful!\n\n🎁 Amazon Gift Card Created:\nCode: ${result.giftCard.claimCode}\nAmount: $${result.giftCard.amount}\n\nTransaction: ${txHash}`);
        } else {
          console.error('❌ Failed to create gift card:', result.error);
          alert(`🎉 Payment successful!\n\n⚠️ Gift card creation failed: ${result.error}\n\nTransaction: ${txHash}`);
        }
      } else {
        console.error('❌ Gift card API call failed:', response.status);
        alert(`🎉 Payment successful!\n\n⚠️ Gift card service unavailable\n\nTransaction: ${txHash}`);
      }
    } catch (error) {
      console.error('❌ Error creating Amazon gift card:', error);
      alert(`🎉 Payment successful!\n\n⚠️ Gift card creation error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTransaction: ${txHash}`);
    }
  };



  // Check for transaction errors
  useEffect(() => {
    if (isSending && !hash) {
      // Transaction failed to send
      setError(new Error('Failed to send transaction'));
    }
  }, [isSending, hash]);

  const connectCoinbaseWallet = () => {
    // Force connection to Base
    connect({ 
      connector: coinbaseWallet(),
      chainId: base.id 
    });
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const makePayment = async () => {
    if (!isConnected || !address) {
      setError(new Error('Please connect your wallet first!'));
      return;
    }

    try {
      setError(null);
      
      console.log(`Initiating USDC payment of ${usdcAmountFromUSD} USDC ($${amount} USD)`);
      console.log(`Transaction will be sent from: ${address} to: ${merchantAddress}`);
      console.log(`USDC amount: ${usdcAmount.toString()} (${usdcAmountFromUSD} USDC)`);

      console.log('=== TRANSACTION DETAILS ===');
      console.log('USDC contract address:', USDC_ADDRESS);
      console.log('Base chain ID:', base.id);
      console.log('Merchant address (Base):', merchantAddress);
      console.log('Amount in USDC units:', usdcAmount.toString());
      console.log('Amount in USDC:', usdcAmountFromUSD);
      console.log('Sender address:', address);
      console.log('Network: Base Mainnet');
      console.log(`Transaction type: USDC transfer ($${amount} USD)`);
      console.log('========================');

      await writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [merchantAddress, usdcAmount],
        chainId: base.id,
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Payment failed');
      console.error('Payment failed:', error);
      setError(error);
      onPaymentError?.(error);
    }
  };

  const handleButtonClick = async () => {
    if (!isConnected) {
      connectCoinbaseWallet();
      return;
    }

    // Check if we're on the right chain
    if (chainId !== base.id) {
      console.log('=== CHAIN SWITCH REQUIRED ===');
      console.log('Current chain ID:', chainId);
      console.log('Target chain ID:', base.id);
      console.log('Switching to Base...');
      try {
        await switchChain({ chainId: base.id });
        console.log('Successfully switched to Base');
      } catch (error) {
        console.error('Failed to switch to Base:', error);
        setError(new Error('Please switch to Base network in your wallet'));
        return;
      }
    } else {
      console.log('Already on Base network');
    }

    // Now make the payment
    makePayment();
  };

  // 🆕 ON RAMP: Generate quote for buying Base ETH
  const generateOnrampQuote = async () => {
    if (!address) return;
    
    try {
      setIsOnrampLoading(true);
      console.log('🔄 Generating On Ramp quote for Base ETH...');
      
      // Calculate required amount (order + estimated gas fees)
      const requiredAmount = 0.01 + 0.001; // $0.01 order + $0.001 gas estimate
      
      const response = await fetch('http://localhost:3001/api/onramp/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          country: 'US',
          destinationAddress: address,
          paymentAmount: requiredAmount.toString(),
          paymentCurrency: 'USD',
          paymentMethod: 'UNSPECIFIED',
          purchaseCurrency: 'ETH',
          purchaseNetwork: 'base',
          subdivision: 'CA'
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ On Ramp quote generated:', result);
      
      setOnrampQuote(result.data);
      
      // Open On Ramp popup
      openOnrampPopup(result.data);
      
    } catch (error) {
      console.error('❌ Error generating On Ramp quote:', error);
      alert('Failed to generate funding options. Please try again.');
    } finally {
      setIsOnrampLoading(false);
    }
  };

  // 🆕 ON RAMP: Open popup for buying Base ETH
  const openOnrampPopup = (quote: OnrampQuoteResponse) => {
    try {
      console.log('🪟 Opening On Ramp popup for Base ETH purchase...');
      
      const popup = window.open(
        quote.onrampUrl,
        'coinbase-onramp',
        'width=500,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked by browser');
      }

      // Listen for popup close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          console.log('🪟 On Ramp popup closed');
          // Recheck gas estimation after popup closes
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      }, 1000);

      // Timeout after 10 minutes
      setTimeout(() => {
        if (!popup.closed) {
          popup.close();
          clearInterval(checkClosed);
        }
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error('❌ Error opening On Ramp popup:', error);
      alert('Failed to open funding options. Please try again.');
    }
  };

  const getButtonText = () => {
    if (isConnecting) return 'Connecting...';
    // Removed gas estimation check
    if (isSending || isConfirming || isPostVerificationProcessing) return 'Processing';
    if (!isConnected) return 'Connect to wallet';
    // Removed gas error check
    return `Pay $${amount.toFixed(2)} USDC on Base`;
  };

  return (
    <div className={className}>
      {/* Disconnect Wallet Button - Only show when connected */}
      {isConnected && (
        <div className={styles.disconnectButtonContainer}>
          <button
            onClick={handleDisconnect}
            className={styles.disconnectWalletButton}
          >
            Disconnect wallet
          </button>
        </div>
      )}
      
      {/* Payment Button Container */}
      <div className={styles.buttonContainer}>
        {/* 🆕 ON RAMP: Show On Ramp button when gas estimation fails */}
        {showOnrampButton && (
          <div style={{ marginBottom: '16px' }}>
            <button 
              onClick={generateOnrampQuote}
              disabled={isOnrampLoading}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '16px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                transition: 'background-color 0.2s',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#218838';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#28a745';
              }}
            >
              {isOnrampLoading ? 'Generating Quote...' : 'Buy Base ETH for Gas Fees'}
            </button>
            <div style={{ 
              fontSize: '12px', 
              color: '#666', 
              textAlign: 'center', 
              marginTop: '8px',
              fontStyle: 'italic'
            }}>
              Need Base ETH to pay for transaction fees
            </div>
          </div>
        )}

        <button 
          onClick={handleButtonClick} 
          disabled={isDisabled} 
          className={`${styles.connectWalletButton} ${(isSending || isConfirming || isPostVerificationProcessing) ? styles.loading : ''}`}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
};

export default PaymentButton;
