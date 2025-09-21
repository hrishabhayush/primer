import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Amazon Crypto Checkout',
  projectId: 'demo-project-id', // Using a demo project ID to prevent errors
  chains: [
    base, // Prioritize Base for mainnet transactions
    mainnet,
    polygon,
    optimism,
    arbitrum,
    sepolia, // Keep Sepolia for testing if needed
  ],
  ssr: true,
});
