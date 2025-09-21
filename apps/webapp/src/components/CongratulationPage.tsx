import React, { useState, useEffect } from 'react';
import styles from '../styles/Home.module.css';

interface CongratulationPageProps {
  senderAddress: string;
  receiverAddress: string;
  transactionHash: string;
  onRedirectNow: () => void;
}

const CongratulationPage: React.FC<CongratulationPageProps> = ({
  senderAddress,
  receiverAddress,
  transactionHash,
  onRedirectNow
}) => {

  const formatAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  const openBlockExplorer = () => {
    // Open Sepolia block explorer for the transaction hash
    window.open(`https://basescan.org/tx/${transactionHash}`, '_blank');
  };

  return (
    <div className={`${styles.mainContainer} ${styles.congratulation}`}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.logoContainer}>
          <img src="/icons/Amazonbutton.svg" alt="Amazon Logo" className={styles.logo} />
        </div>
        <div className={styles.headerTitle}>Crypto Checkout</div>
      </div>

      {/* Main Content */}
      <div className={styles.congratulationContent}>
        <h2 className={styles.congratulationTitle}>Congratulations,</h2>
        
        <div className={styles.congratulationMessage}>
          The transaction has been confirmed.
        </div>

        {/* Transaction Details */}
        <div className={styles.transactionDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Wallet Sender Address:</span>
            <span className={styles.detailValue}>{formatAddress(senderAddress)}</span>
          </div>
          
          <div className={`${styles.detailRow} ${styles.amazonReceiverRow}`}>
            <span className={styles.detailLabel}>One-time Payment Address:</span>
            <span className={styles.detailValue}>{formatAddress(receiverAddress)}</span>
          </div>
          
          <div className={styles.divider}></div>
          
          <div className={`${styles.detailRow} ${styles.transactionHashRow}`}>
            <span className={styles.detailLabel}>Transaction Hash:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px'}}>
              <button className={styles.externalLinkButton} onClick={openBlockExplorer}>
                <img src="/icons/opennewwindow.svg" alt="External Link" />
              </button>
              <span className={styles.detailValue}>{formatAddress(transactionHash)}</span>
            </div>
          </div>
        </div>

        {/* Redirect Button */}
        <button className={styles.redirectButton} onClick={onRedirectNow}>
          Go back to Amazon
        </button>
      </div>
    </div>
  );
};

export default CongratulationPage; 