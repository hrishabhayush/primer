// Merchant Configuration
export const MERCHANT_CONFIG = {
  // Base mainnet merchant wallet address
  WALLET_ADDRESS: '0xAF5BE3C059aacBBbD23522B3cFc892313d1B47D5' as `0x${string}`,
  
  // Network configuration
  NETWORK: {
    CHAIN_ID: 8453, // Base mainnet
    NAME: 'Base',
    EXPLORER_URL: 'https://basescan.org'
  }
};

// Helper function to get merchant address
export const getMerchantAddress = (): `0x${string}` => {
  return MERCHANT_CONFIG.WALLET_ADDRESS;
};

// Helper function to get network info
export const getNetworkInfo = () => {
  return MERCHANT_CONFIG.NETWORK;
}; 