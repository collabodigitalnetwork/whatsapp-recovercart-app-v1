import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Layout components
      "s-page": any;
      "s-section": any;
      "s-card": any;
      "s-box": any;
      "s-stack": any;
      "s-empty-state": any;
      
      // Navigation
      "s-link": any;
      "s-app-nav": any;
      "s-tabs": any;
      "s-tab": any;
      
      // Forms
      "s-form": any;
      "s-text-field": any;
      "s-select": any;
      "s-checkbox": any;
      "s-radio-button": any;
      
      // Actions
      "s-button": any;
      "s-button-group": any;
      
      // Content
      "s-heading": any;
      "s-text": any;
      "s-paragraph": any;
      "s-badge": any;
      "s-banner": any;
      
      // Lists
      "s-unordered-list": any;
      "s-list-item": any;
      
      // Data display
      "s-data-table": any;
      "s-skeleton-body-text": any;
      "s-progress-bar": any;
      
      // Modals
      "s-modal": any;
      "s-modal-content": any;
      "s-modal-footer": any;
      
      // Other
      "s-popover": any;
      "s-tooltip": any;
      "s-spinner": any;
    }
  }
}

export {};