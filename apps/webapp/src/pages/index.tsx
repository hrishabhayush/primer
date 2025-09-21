import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useConnect, useAccount, useDisconnect, useBalance } from 'wagmi';
import { coinbaseWallet } from 'wagmi/connectors';
import { pay, getPaymentStatus } from '@base-org/account';
import { priceConversionService, PriceData } from '../services/priceConversion';
import { getMerchantAddress } from '../config/merchant';
import PaymentButton from '../components/PaymentButton';
import CongratulationPage from '../components/CongratulationPage';
import styles from '../styles/Home.module.css';

const Home = () => {
  const [productPrice, setProductPrice] = useState<number>(0.01);
  const [productTitle, setProductTitle] = useState<string>('Amazon Basics 4K Fire TV Stick');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isBasePay, setIsBasePay] = useState<boolean>(false);
  
  // Price state - commented out for now, using fixed $0.01
  // const [priceData, setPriceData] = useState<PriceData | null>(null);
  // const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  
  // Congratulation page state
  const [showCongratulation, setShowCongratulation] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string>('');
  
  // Wagmi hooks for wallet connection
  const { connect, isPending: isConnecting } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  // USDC contract address on Base
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  
  // Read USDC balance
  const { data: usdcBalance, isLoading: isUsdcBalanceLoading } = useBalance({
    address: address,
    token: USDC_ADDRESS,
  });
  
  // Get Sepolia merchant address from config
  const MERCHANT_ADDRESS = getMerchantAddress();

  // Ensure wallet is disconnected by default when component mounts
  useEffect(() => {
    // Disconnect wallet on page load to ensure clean state
    if (isConnected) {
      disconnect();
    }
  }, []); // Empty dependency array - only run once on mount

  // Load price conversion when component mounts or price changes - COMMENTED OUT FOR NOW
  // useEffect(() => {
  //   const loadPriceConversion = async () => {
  //     if (productPrice > 0) {
  //       setIsLoadingPrice(true);
  //       try {
  //         const convertedPrice = await priceConversionService.convertUsdToEth(productPrice);
  //         setPriceData(convertedPrice);
  //       } catch (error) {
  //         console.error('Failed to convert price:', error);
  //       } finally {
  //         setIsLoadingPrice(false);
  //       }
  //     }
  //   };

  //   loadPriceConversion();
  // }, [productPrice]);

  useEffect(() => {
    // Get price, title, and wallet type from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const price = urlParams.get('price');
    const title = urlParams.get('title');
    const wallet = urlParams.get('wallet');
    
    if (price) {
      const priceNum = parseFloat(price);
      setProductPrice(priceNum);
    }
    
    if (title) {
      setProductTitle(decodeURIComponent(title));
    }
    
    if (wallet === 'basepay') {
      setIsBasePay(true);
    }

    // Update time every second
    const timeInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
      }));
    }, 1000);

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  const connectCoinbaseWallet = () => {
    connect({ connector: coinbaseWallet() });
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handlePaymentSuccess = async (txHash: string) => {
    console.log('Payment successful! Transaction hash:', txHash);
    
    // 🔄 Use full backend CDP verification flow
    await createCheckoutSessionAndVerify(txHash);
  };

  // 🔄 NEW: Create checkout session and verify payment using CDP
  const createCheckoutSessionAndVerify = async (txHash: string) => {
    try {
      console.log('🔍 Creating checkout session and verifying payment...');
      
      // Create checkout session in backend
      const sessionData = {
        amazonUrl: window.location.href,
        cartTotalCents: Math.round(productPrice * 100), // Convert to cents
        currentBalanceCents: 0, // User has no current balance
        userId: address || 'anonymous' // Use wallet address as user ID
      };

      // Try to connect to backend, but handle case where it's not available (e.g., on Vercel)
      const backendUrl = process.env.NODE_ENV === 'production' 
        ? 'https://your-backend-url.vercel.app' // Replace with your actual backend URL
        : 'http://localhost:3001';
        
      const response = await fetch(`${backendUrl}/api/checkout-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData)
      });

      if (response.ok) {
        const result = await response.json();
        const sessionId = result.session.sessionId;
        console.log('✅ Checkout session created:', sessionId);
        
        // Wait a bit for transaction to be indexed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify payment using CDP tracking
        const verificationResponse = await fetch(`${backendUrl}/api/wallet/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromAddress: address,
            toAddress: MERCHANT_ADDRESS,
            amount: productPrice.toString(),
            token: 'ETH', // Changed from USDC to ETH since we're sending ETH
            minutes: 5
          })
        });

        if (verificationResponse.ok) {
          const verificationResult = await verificationResponse.json();
          
          if (verificationResult.paymentVerified) {
            console.log('✅ Payment verified! Transaction:', verificationResult.transaction);
            
            // Get gift codes for the session
            const giftCodesResponse = await fetch(`${backendUrl}/api/checkout-sessions/${sessionId}/gift-codes`);
            
            if (giftCodesResponse.ok) {
              const giftCodesResult = await giftCodesResponse.json();
              console.log('🎁 Gift codes allocated:', giftCodesResult.giftCodes);
              
              // Trigger gift card automation
              await triggerGiftCardAutomation(sessionId, giftCodesResult.giftCodes, txHash);
            } else {
              console.error('❌ Failed to get gift codes');
            }
          } else {
            console.log('⚠️ Payment not verified yet:', verificationResult.message);
            // Could retry verification here
          }
        } else {
          console.error('❌ Payment verification failed');
        }
      } else {
        console.log('⚠️ Backend not available, skipping backend integration');
        // Still show success message even if backend is not available
        alert('🎉 Payment successful! (Backend integration unavailable)');
      }
    } catch (error) {
      console.error('❌ Error in payment flow:', error);
    }
  };

  // 🔄 NEW: Trigger gift card automation
  const triggerGiftCardAutomation = async (sessionId: string, giftCodes: any[], txHash: string) => {
    try {
      console.log('🎁 Triggering gift card automation...');
      console.log('📍 Current URL:', window.location.href);
      console.log('🎫 Gift codes to apply:', giftCodes);
      
      // Send automation trigger to extension via localStorage and postMessage
      const automationData = {
        type: 'GIFT_CARD_AUTOMATION',
        sessionId,
        amazonUrl: window.location.href,
        giftCodes,
        totalAmount: productPrice,
        transactionHash: txHash,
        timestamp: Date.now()
      };
      
      console.log('📤 Sending automation data:', automationData);
      
      // Set localStorage (for cross-tab communication)
      localStorage.setItem('stablecart_gift_card_automation', JSON.stringify(automationData));
      console.log('💾 Stored in localStorage');
      
      // Send via postMessage (for same-tab communication)
      window.postMessage(automationData, '*');
      console.log('📨 Posted message to window');
      
      // Also try dispatching a custom event
      const customEvent = new CustomEvent('giftCardAutomation', { detail: automationData });
      window.dispatchEvent(customEvent);
      console.log('🎯 Dispatched custom event');
      
      console.log('✅ Gift card automation triggered via multiple channels');
      
      // Show user notification that automation is happening
      alert('🎁 Gift card automation triggered! Please navigate to Amazon checkout page to see the magic happen.');
      
    } catch (error) {
      console.error('❌ Error triggering gift card automation:', error);
    }
  };

  const handleShowCongratulation = (txHash: string) => {
    setTransactionHash(txHash);
    setShowCongratulation(true);
  };

  const handleRedirectNow = () => {
    // Redirect back to Amazon or close the window
    window.close();
    // Fallback: redirect to Amazon homepage
    window.location.href = 'https://www.amazon.com';
  };

  const handlePaymentError = (error: Error) => {
    console.error('Payment failed:', error);
    alert(`Payment failed: ${error.message}`);
  };

  // Base Pay payment function
  const handleBasePayPayment = async () => {
    try {
      console.log('🚀 Initiating Base Pay payment...');
      
      const payment = await pay({
        amount: productPrice.toFixed(2),
        to: MERCHANT_ADDRESS,
        testnet: true // Set to false for mainnet
      });
      
      console.log(`✅ Base Pay payment initiated! Transaction ID: ${payment.id}`);
      
      // Poll for payment completion
      const pollForCompletion = async () => {
        try {
          const { status } = await getPaymentStatus({
            id: payment.id,
            testnet: true // Must match the testnet setting used in pay()
          });
          
          if (status === 'completed') {
            console.log('🎉 Base Pay payment completed!');
            // Call existing success handler with transaction ID
            await handlePaymentSuccess(payment.id);
            handleShowCongratulation(payment.id);
          } else {
            console.log(`Payment status: ${status}, continuing to poll...`);
            setTimeout(pollForCompletion, 2000); // Poll every 2 seconds
          }
        } catch (error) {
          console.error('Error checking payment status:', error);
          handlePaymentError(error as Error);
        }
      };
      
      // Start polling
      setTimeout(pollForCompletion, 2000);
      
    } catch (error) {
      console.error('❌ Base Pay payment failed:', error);
      handlePaymentError(error as Error);
    }
  };

  // Update the wallet sender address display when connected
  const getWalletDisplay = () => {
    if (!isConnected || !address) {
      return 'Not connected';
    }
    // Show first 6 and last 4 characters of the address
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Format receiver address with ellipses
  const formatReceiverAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  // Format product name with ellipses like popup
  const formatProductName = (title: string) => {
    return title.length > 15 ? title.substring(0, 15) + '...' : title;
  };

  // Debug logging for wallet connection state (commented out to reduce console spam)
  // console.log('Wallet connection state:', { isConnected, address });

  // Show congratulation page if transaction was successful
  if (showCongratulation) {
    return (
      <CongratulationPage
        senderAddress={address || ''}
        receiverAddress={MERCHANT_ADDRESS}
        transactionHash={transactionHash}
        onRedirectNow={handleRedirectNow}
      />
    );
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Primer - Crypto Checkout</title>
        <meta
          content="Connect your wallet to Primer"
          name="description"
        />
      </Head>

      <main className={styles.main}>
        {/* Main Container - Fixed size like popup */}
        <div className={styles.mainContainer}>
          {/* Header Section - Exactly like popup */}
          <div className={styles.header}>
            <div className={styles.logoContainer}>
              <img src="/icons/Amazonbutton.svg" alt="Amazon Logo" className={styles.logo} />
            </div>
            <div className={styles.headerTitle}>Crypto Checkout</div>
          </div>

          {/* Items Breakdown Section - Exactly like popup */}
          <div className={styles.itemsBreakdown}>
            <h2 className={styles.sectionTitle}>Items Breakdown:</h2>
            
            <div className={styles.itemRow}>
              <span className={styles.itemLabel}>{formatProductName(productTitle)}</span>
              <span className={styles.itemValue}>x1</span>
            </div>
            
            <div className={styles.itemRow}>
              <span className={styles.itemLabel}>
                Estimated Gas Fee: 
                <span className={styles.infoIcon}>
                  <img src="/icons/info.svg" alt="Info" />
                </span>
              </span>
              <span className={styles.itemValue}>$0.01</span>
            </div>
            
            <div className={styles.divider}></div>
            
            <div className={styles.itemRow}>
              <span className={styles.itemLabel}>Total:</span>
              <span className={styles.itemValue}>{productPrice.toFixed(2)} USDC (${productPrice.toFixed(2)})</span>
            </div>
            
            <div className={styles.itemRow}>
              <span className={styles.itemLabel}>Estimated Transaction Time:</span>
              <span className={styles.itemValue}>
                <img src="/icons/time.svg" alt="Time" className={styles.timeIcon} />
                &lt;1m
              </span>
            </div>
          </div>

          {/* Combined Information Container */}
          <div className={styles.infoContainer}>
            {/* Transaction Information Section */}
            <div className={styles.section}>
              <h3 className={styles.sectionSubtitle}>Transaction Information</h3>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Wallet Sender Address:</span>
                <span className={styles.infoValue}>{getWalletDisplay()}</span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>One-time Payment Address:</span>
                <span className={styles.infoValue}>{formatReceiverAddress(MERCHANT_ADDRESS)}</span>
              </div>
            </div>

            {/* Separator Line */}
            <div className={styles.sectionSeparator}></div>

            {/* Price Information Section */}
            <div className={styles.section}>
              <h3 className={styles.sectionSubtitle}>Price Information</h3>
              
              <div className={styles.timestampInfo}>
                Last updated: {currentTime}
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Amazon Listing Price:</span>
                <span className={styles.infoValue}>${productPrice.toFixed(2)} USD</span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>USDC Wallet Balance:</span>
                <span className={styles.infoValue}>$
                  {isUsdcBalanceLoading ? 'Loading...' : 
                   usdcBalance ? `$${parseFloat(usdcBalance.formatted).toFixed(2)} USDC` : 
                   '$0.00 USDC'}
                </span>
              </div>
            </div>

            {/* Separator Line */}
            <div className={styles.sectionSeparator}></div>

            {/* Blockchain Information Section */}
            <div className={styles.section}>
              <h3 className={styles.sectionSubtitle}>Blockchain Information</h3>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Chain:</span>
                <span className={styles.infoValue}>Base</span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Token:</span>
                <span className={styles.infoValue}>USD Coin (USDC)</span>
              </div>
            </div>
          </div>

          {/* Connection Info Footer */}
          <div className={styles.connectionInfo}>
            {isBasePay ? (
              // Show Base Pay info when using Base Pay
              <>
                <span className={styles.connectionLabel}>Connecting through: </span>
                <span className={styles.connectionValue}>Base Pay</span>
                {/* <span className={styles.coinbaseIcon}>
                  <img src="/icons/basepay.png" alt="Base Pay" />
                </span> */}
              </>
            ) : isConnected ? (
              // Don't show "Connected to:" text when wallet is connected
              // The disconnect button in PaymentButton already shows connection status
              null
            ) : (
              <>
                <span className={styles.connectionLabel}>Connecting through: </span>
                <span className={styles.connectionValue}>Coinbase Wallet</span>
                <span className={styles.coinbaseIcon}>
                  <img src="/icons/CB.svg" alt="Coinbase Wallet" />
                </span>
              </>
            )}
          </div>
          
          {/* Disconnect Button - Show when wallet is connected */}
          {isConnected && (
            <div className={styles.disconnectButtonContainer}>
              <button 
                className={styles.disconnectWalletLink}
                onClick={handleDisconnect}
              >
                Disconnect from Wallet
              </button>
            </div>
          )}
          
          {/* Main Button - Show Base Pay or traditional PaymentButton */}
          {isBasePay ? (
            <div className={styles.paymentButtonContainer}>
              <button
                onClick={handleBasePayPayment}
                className={styles.basePayButton}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#0052ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  // fontSize: '16px',
                  // fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              > Checkout with
                <img src="/icons/white.png" alt="Base Pay" style={{ width: '60px', height: 'auto' }} />
              </button>
            </div>
          ) : (
            <PaymentButton
              amount={productPrice}
              merchantAddress={MERCHANT_ADDRESS}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              onShowCongratulation={handleShowCongratulation}
              disabled={false}
              className={styles.paymentButtonContainer}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
