import AWS from 'aws-sdk';
import crypto from 'crypto';

interface CreateGiftCardRequest {
  creationRequestId: string;
  partnerId: string;
  value: {
    currencyCode: string;
    amount: number;
  };
}

interface CreateGiftCardResponse {
  statusCode: string;
  gcClaimCode?: string;
  gcId?: string;
  creationRequestId?: string;
  errorCode?: string;
  message?: string;
}

export class AmazonGiftCardService {
  private accessKey: string;
  private secretKey: string;
  private partnerId: string;
  private region: string;
  private endpoint: string;

  constructor() {
    this.accessKey = process.env.AGCOD_ACCESS_KEY || '';
    this.secretKey = process.env.AGCOD_SECRET_KEY || '';
    this.partnerId = process.env.AGCOD_PARTNER_ID || '';
    this.region = process.env.AGCOD_REGION || 'us-east-1';
    this.endpoint = process.env.AGCOD_ENDPOINT || 'https://agcod-v2-gamma.amazon.com';

    if (!this.accessKey || !this.secretKey || !this.partnerId) {
      throw new Error('Missing required Amazon Gift Card API credentials in environment variables');
    }
  }

  /**
   * Creates a gift card using Amazon Incentives API
   * @param amount - Amount in USD (e.g., 0.01 for $0.01)
   * @param currencyCode - Currency code (default: USD)
   * @returns Promise<CreateGiftCardResponse>
   */
  async createGiftCard(amount: number, currencyCode: string = 'USD'): Promise<CreateGiftCardResponse> {
    try {
      console.log(`🎁 Creating Amazon gift card for $${amount} ${currencyCode}`);

      const creationRequestId = this.generateCreationRequestId();
      
      const requestBody: CreateGiftCardRequest = {
        creationRequestId,
        partnerId: this.partnerId,
        value: {
          currencyCode,
          amount: Math.round(amount * 100) // Convert to cents
        }
      };

      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

      // Create signed request
      const signedRequest = this.createSignedRequest(requestBody);
      
      // Make API call
      const response = await fetch(this.endpoint, signedRequest);
      const responseText = await response.text();
      
      console.log('📥 Response status:', response.status);
      console.log('📥 Response body:', responseText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      // Parse response
      let responseData: CreateGiftCardResponse;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse JSON response:', parseError);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (responseData.statusCode === 'SUCCESS' && responseData.gcClaimCode) {
        console.log('✅ Gift card created successfully:', responseData.gcClaimCode);
        return responseData;
      } else {
        console.error('❌ Gift card creation failed:', responseData);
        throw new Error(`Gift card creation failed: ${responseData.errorCode || responseData.message || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ Error creating gift card:', error);
      throw error;
    }
  }

  /**
   * Generates a unique creation request ID
   * Must start with partnerId according to Amazon specification
   */
  private generateCreationRequestId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${this.partnerId}_${timestamp}_${random}`;
  }

  /**
   * Creates a signed request for Amazon Incentives API
   */
  private createSignedRequest(requestBody: CreateGiftCardRequest): RequestInit {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);

    // Create canonical request
    const method = 'POST';
    const canonicalUri = '/CreateGiftCard';
    const canonicalQueryString = '';
    const canonicalHeaders = `host:${this.getHost()}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
    
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/AGCODService/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    // Calculate signature
    const signature = this.calculateSignature(stringToSign, dateStamp);

    // Create authorization header
    const authorization = `${algorithm} Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-amz-date': amzDate,
        'Authorization': authorization,
        'x-amz-target': 'com.amazonaws.agcod.AGCODService.CreateGiftCard'
      },
      body: JSON.stringify(requestBody)
    };
  }

  /**
   * Extracts host from endpoint URL
   */
  private getHost(): string {
    try {
      return new URL(this.endpoint).host;
    } catch (error) {
      throw new Error(`Invalid endpoint URL: ${this.endpoint}`);
    }
  }

  /**
   * Calculates AWS4 signature
   */
  private calculateSignature(stringToSign: string, dateStamp: string): string {
    const kDate = crypto.createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('AGCODService').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    
    return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing Amazon Gift Card API connection...');
      const result = await this.createGiftCard(0.01);
      console.log('✅ API connection test successful');
      return result.statusCode === 'SUCCESS';
    } catch (error) {
      console.error('❌ API connection test failed:', error);
      return false;
    }
  }
}