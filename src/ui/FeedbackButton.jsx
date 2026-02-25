import React from 'react';
import { trackFeedbackOpen, trackFeedbackSubmit } from '../analytics.js';

const FORM_ID = 'obAELN';

/**
 * Opens the Tally feedback popup.
 * Falls back to opening the form in a new tab if the Tally SDK hasn't loaded
 * (e.g. blocked by an ad-blocker or network issue).
 */
export default function FeedbackButton() {
  function handleClick() {
    if (!window.Tally) {
      window.open(`https://tally.so/r/${FORM_ID}`, '_blank', 'noopener,noreferrer');
      return;
    }
    trackFeedbackOpen();
    window.Tally.openPopup(FORM_ID, {
      layout: 'modal',
      width: 440,
      overlay: true,
      onSubmit: () => trackFeedbackSubmit(),
    });
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={handleClick}
      title="Share feedback"
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}
    >
      <span style={{ fontSize: 12 }}>💬</span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Feedback</span>
    </button>
  );
}
