window.__cardBoot = 'module';
import './card-app.css';
import { mountApp } from './app.js';
import { initPwaUpdates } from './pwa-update.js';
import { captureReferralFromUrl } from './referral-card.js';

mountApp();
window.__cardBoot = 'mounted';
initPwaUpdates();
captureReferralFromUrl();
