import React from 'react';
import { IconClose, IconPlus } from './Icons';

export const TabBar = ({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab }) => {
  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div 
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="tab-title" title={tab.name}>
                {tab.name.length > 18 ? `${tab.name.substring(0, 15)}....pdf` : tab.name}
              </span>
              <button 
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                aria-label="Close tab"
              >
                <IconClose size={12} color={isActive ? "#d1d5db" : "#808694"} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="tab-add-btn" onClick={onAddTab} title="Open new document tab" aria-label="Add tab">
        <IconPlus size={15} color="#9aa0ac" />
      </button>
    </div>
  );
};
