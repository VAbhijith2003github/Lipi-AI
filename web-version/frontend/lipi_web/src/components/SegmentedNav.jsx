import React from 'react';

export const SegmentedNav = ({ activeView, onChangeView }) => {
  return (
    <div className="segmented-nav-container">
      <div className="segmented-nav">
        <button
          className={`nav-pill ${activeView === 'documents' ? 'active' : ''}`}
          onClick={() => onChangeView('documents')}
        >
          Documents
        </button>
        <button
          className={`nav-pill ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onChangeView('settings')}
        >
          Settings
        </button>
      </div>
    </div>
  );
};
