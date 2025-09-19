/**
 * Payment Monitor for Extension
 * Polls backend to detect when USDC payments are received on merchant address
 * Triggers gift card automation when payment is confirmed
 */

// Note: We'll hardcode the merchant address here since importing from webapp would cause build issues
const MERCHANT_ADDRESS = '0xf78bf2c8f95aE05cc77B3F1eC2F93E8b89Bd3DdD'; // Base mainnet merchant address

export interface PaymentDetectionConfig {
  customerAddress: string;
  merchantAddress: string;
  expectedAmount: number;
  token: 'USDC';
  sessionId?: string;
  amazonUrl?: string;
}

export class PaymentMonitor {
  private config: PaymentDetectionConfig | null = null;
  private isMonitoring: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private backendUrl: string = 'http://localhost:3001';
  private maxAttempts: number = 30; // Monitor for 5 minutes (30 * 10s)
  private currentAttempts: number = 0;

  /**
   * Start monitoring for payment
   */
  startMonitoring(config: PaymentDetectionConfig): void {
    console.log('💰 Starting payment monitoring...', config);
    
    this.config = config;
    this.isMonitoring = true;
    this.currentAttempts = 0;

    // Start polling every 10 seconds
    this.pollInterval = setInterval(() => {
      this.checkForPayment();
    }, 10000);

    // Also check immediately
    this.checkForPayment();

    // Show monitoring indicator
    this.showMonitoringMessage('Waiting for payment confirmation...');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    console.log('⏹️ Stopping payment monitoring');
    
    this.isMonitoring = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.config = null;
    this.currentAttempts = 0;
  }

  /**
   * Check for payment using backend verification
   */
  private async checkForPayment(): Promise<void> {
    if (!this.config || !this.isMonitoring) {
      return;
    }

    this.currentAttempts++;
    console.log(`🔍 Checking for payment (attempt ${this.currentAttempts}/${this.maxAttempts})`);

    // Stop monitoring after max attempts
    if (this.currentAttempts >= this.maxAttempts) {
      console.log('⏰ Payment monitoring timeout');
      this.stopMonitoring();
      this.showErrorMessage('Payment verification timeout. Please try again.');
      return;
    }

    try {
      const response = await fetch(`${this.backendUrl}/api/wallet/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromAddress: this.config.customerAddress,
          toAddress: this.config.merchantAddress,
          amount: this.config.expectedAmount.toString(),
          token: this.config.token,
          minutes: 10 // Look for payments in last 10 minutes
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const result = await response.json();
      console.log('📊 Payment verification result:', result);

      if (result.success && result.paymentVerified) {
        console.log('✅ Payment confirmed!', result.transaction);
        
        // Payment found! Stop monitoring and trigger automation
        this.stopMonitoring();
        await this.triggerGiftCardAutomation(result.transaction);
        
      } else if (result.hasRecentActivity) {
        console.log('⏳ Recent activity detected but payment not yet confirmed');
        this.showMonitoringMessage(`Payment activity detected... (${this.currentAttempts}/${this.maxAttempts})`);
        
      } else {
        console.log('⏳ No payment detected yet');
        this.showMonitoringMessage(`Waiting for payment... (${this.currentAttempts}/${this.maxAttempts})`);
      }

    } catch (error) {
      console.error('❌ Error checking for payment:', error);
      
      // Don't stop monitoring on API errors, just continue trying
      this.showMonitoringMessage(`Connection issue, retrying... (${this.currentAttempts}/${this.maxAttempts})`);
    }
  }

  /**
   * Trigger gift card automation when payment is confirmed
   */
  private async triggerGiftCardAutomation(transaction: any): Promise<void> {
    try {
      console.log('🎁 Triggering gift card automation...');

      // Show success message
      this.showSuccessMessage('Payment confirmed! Applying gift cards...');

      // Get gift codes from backend (this would need to be implemented)
      const giftCodes = await this.getGiftCodesForOrder();

      // Create automation data
      const automationData = {
        type: 'GIFT_CARD_AUTOMATION',
        sessionId: this.config?.sessionId || `session_${Date.now()}`,
        amazonUrl: this.config?.amazonUrl || window.location.href,
        giftCodes: giftCodes,
        totalAmount: this.config?.expectedAmount || 0.01,
        transactionHash: transaction.transactionHash,
        timestamp: Date.now()
      };

      console.log('🎯 Sending automation data:', automationData);

      // Store in localStorage for gift card handler to pick up
      localStorage.setItem('stablecart_gift_card_automation', JSON.stringify(automationData));

      // Also dispatch custom event
      window.dispatchEvent(new CustomEvent('giftCardAutomation', {
        detail: automationData
      }));

      // Also try postMessage
      window.postMessage(automationData, '*');

      console.log('✅ Gift card automation triggered successfully!');

    } catch (error) {
      console.error('❌ Error triggering gift card automation:', error);
      this.showErrorMessage('Payment confirmed but automation failed. Please try manually.');
    }
  }

  /**
   * Get gift codes for the order (placeholder - needs backend implementation)
   */
  private async getGiftCodesForOrder(): Promise<Array<{code: string; denomination: number; status: string}>> {
    try {
      // For now, return a mock gift code
      // In production, this would call the backend to get actual gift codes
      return [
        {
          code: 'MOCK-GIFT-CODE-12345',
          denomination: 1, // $0.01 in cents
          status: 'ACTIVE'
        }
      ];

      // TODO: Implement actual backend call
      // const response = await fetch(`${this.backendUrl}/api/admin/gift-codes/for-order`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     amount: this.config?.expectedAmount,
      //     sessionId: this.config?.sessionId
      //   })
      // });
      // const result = await response.json();
      // return result.giftCodes || [];

    } catch (error) {
      console.error('❌ Error getting gift codes:', error);
      return [];
    }
  }

  /**
   * Show monitoring message
   */
  private showMonitoringMessage(message: string): void {
    const messageDiv = document.getElementById('stablecart-payment-monitor') || this.createMessageDiv();
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px;
    `;
    messageDiv.textContent = message;
  }

  /**
   * Show success message
   */
  private showSuccessMessage(message: string): void {
    const messageDiv = document.getElementById('stablecart-payment-monitor') || this.createMessageDiv();
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px;
    `;
    messageDiv.textContent = message;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 5000);
  }

  /**
   * Show error message
   */
  private showErrorMessage(message: string): void {
    const messageDiv = document.getElementById('stablecart-payment-monitor') || this.createMessageDiv();
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dc3545;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px;
    `;
    messageDiv.textContent = message;

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 10000);
  }

  /**
   * Create message div
   */
  private createMessageDiv(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'stablecart-payment-monitor';
    document.body.appendChild(div);
    return div;
  }

  /**
   * Static method to start monitoring from extension
   */
  static startPaymentMonitoring(customerAddress: string, sessionId?: string): void {
    const monitor = new PaymentMonitor();
    
    monitor.startMonitoring({
      customerAddress,
      merchantAddress: MERCHANT_ADDRESS, // Base mainnet merchant address
      expectedAmount: 0.01, // Fixed $0.01 USDC
      token: 'USDC',
      sessionId: sessionId || `session_${Date.now()}`,
      amazonUrl: window.location.href
    });

    // Store monitor instance globally so it can be stopped if needed
    (window as any).stablecartPaymentMonitor = monitor;
  }
}

// Export singleton instance
export const paymentMonitor = new PaymentMonitor();
