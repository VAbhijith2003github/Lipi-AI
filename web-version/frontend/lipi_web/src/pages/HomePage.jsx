import React from 'react';
import { UploadZone } from '../components/UploadZone';
import { RecentDocs } from '../components/RecentDocs';

export const HomePage = ({ 
  recentDocs, 
  onFileSelected, 
  onOpenDoc, 
  onDeleteDoc,
  docLoadError,
  onDismissError,
}) => {
  return (
    <>
      {docLoadError && (
        <div className="doc-load-error-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span><strong>Backend error:</strong> {docLoadError}</span>
          <button className="error-banner-dismiss" onClick={onDismissError} title="Dismiss">×</button>
        </div>
      )}
      <UploadZone onFileSelected={onFileSelected} />
      <RecentDocs
        documents={recentDocs}
        onOpenDoc={onOpenDoc}
        onDeleteDoc={onDeleteDoc}
      />
    </>
  );
};
