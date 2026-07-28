import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

const appTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,

  token: {
    colorPrimary: '#9a6b4a',
    colorSuccess: '#4a8564',
    colorWarning: '#c49a5a',
    colorError: '#b8524a',
    colorInfo: '#4a6fa5',
    colorLink: '#9a6b4a',

    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f7f6f3',
    colorBgSpotlight: '#2c2a26',

    colorBorder: '#e8e6e2',
    colorBorderSecondary: '#efedea',
    colorSplit: '#e8e6e2',

    colorText: '#2c2a26',
    colorTextSecondary: '#6b6860',
    colorTextTertiary: '#9d9a92',
    colorTextQuaternary: '#c4c1b9',
    colorTextDisabled: '#c4c1b9',
    colorTextHeading: '#1a1917',
    colorTextDescription: '#6b6860',

    fontFamily:
      "'Source Sans 3', 'SF Pro Display', system-ui, -apple-system, sans-serif",
    fontFamilyCode: "'IBM Plex Mono', 'SF Mono', monospace",
    fontSize: 14,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    fontSizeLG: 16,
    fontSizeSM: 13,
    fontSizeXL: 20,

    borderRadius: 6,
    borderRadiusLG: 10,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 30,

    boxShadow:
      '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
    boxShadowSecondary:
      '0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
    boxShadowTertiary:
      '0 4px 16px rgba(0,0,0,0.05), 0 12px 48px rgba(0,0,0,0.08)',

    motionDurationFast: '80ms',
    motionDurationMid: '150ms',
    motionDurationSlow: '300ms',
    motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    motionEaseInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    motionEaseOutQuint: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },

  components: {
    Card: {
      colorBgContainer: '#ffffff',
      colorBorderSecondary: 'transparent',
      borderRadiusLG: 12,
      boxShadowTertiary:
        '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
    },
    Table: {
      colorBgContainer: '#ffffff',
      headerBg: '#fafaf8',
      rowHoverBg: '#faf9f7',
      borderColor: '#efedea',
      headerColor: '#6b6860',
    },
    Button: {
      controlHeight: 36,
      controlHeightLG: 42,
      borderRadius: 6,
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
    Input: {
      controlHeight: 36,
      borderRadius: 6,
      activeBorderColor: '#9a6b4a',
      hoverBorderColor: '#c4a888',
      activeShadow: '0 0 0 3px rgba(154, 107, 74, 0.1)',
    },
    Select: {
      controlHeight: 36,
      borderRadius: 6,
    },
    Modal: {
      borderRadiusLG: 14,
      boxShadow:
        '0 4px 16px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.1)',
    },
    Tag: {
      borderRadiusSM: 999,
      fontSizeSM: 12,
    },
    Layout: {
      siderBg: '#f7f6f3',
      headerBg: '#ffffff',
    },
  },
};

export { appTheme };
