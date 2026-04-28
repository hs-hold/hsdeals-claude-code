import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FINANCIAL_CONFIG } from '@/config/financial';
import { InvestmentScoreSettings, DEFAULT_INVESTMENT_SCORE_SETTINGS } from '@/utils/investmentScore';

export type { InvestmentScoreSettings };

export type ThemeMode = 'light' | 'dark' | 'auto';
export type DesignTheme = 'default' | 'ocean' | 'sunset' | 'forest';
export type DefaultAnalysisView = 'flip' | 'rental' | 'brrrr';
export type NumberFormat = 'comma' | 'space';

export interface LoanDefaults {
  // Flip-specific loan settings
  flipDownPaymentPercent: number;
  flipInterestRate: number;
  flipLoanTermYears: number;
  flipClosingCostsPercent: number;
  contingencyPercent: number;
  agentCommissionPercent: number;
  holdingMonths: number;
  // HML defaults (used in Flip)
  hmlLtvPurchasePercent: number;
  hmlLtvRehabPercent: number;
  hmlPointsPercent: number;
  hmlInterestRate: number;
  hmlProcessingFee: number;
  
  // Rental-specific loan settings
  rentalDownPaymentPercent: number;
  rentalInterestRate: number;
  rentalLoanTermYears: number;
  rentalClosingCostsPercent: number;
  propertyManagementPercent: number;
  maintenanceVacancyPercent: number;
  capexPercent: number;
  
  // BRRRR-specific loan settings
  brrrrDownPaymentPercent: number;
  brrrrInterestRate: number;
  brrrrLoanTermYears: number;
  brrrrClosingCostsPercent: number;
  refiLtvPercent: number;
  refiClosingPercent: number;
  
  // Legacy fields for backward compatibility (mapped to rental)
  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;
  closingCostsPercent: number;
}

interface Settings {
  themeMode: ThemeMode;
  designTheme: DesignTheme;
  compactMode: boolean;
  showPercentages: boolean;
  defaultCurrency: 'USD' | 'ILS';
  defaultAnalysisView: DefaultAnalysisView;
  analysisViewsOrder: DefaultAnalysisView[];
  autoSaveOverrides: boolean;
  numberFormat: NumberFormat;
  loanDefaults: LoanDefaults;
  investmentScoreSettings: InvestmentScoreSettings;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  updateLoanDefaults: (updates: Partial<LoanDefaults>) => void;
  updateInvestmentScoreSettings: (updates: Partial<InvestmentScoreSettings>) => void;
  effectiveTheme: 'light' | 'dark';
}

// Generate defaults from FINANCIAL_CONFIG to keep everything in sync
export function getDefaultLoanDefaults(): LoanDefaults {
  return {
    // Flip defaults
    flipDownPaymentPercent: 25, // 25% down for flip
    flipInterestRate: 7.5, // 7.5%
    flipLoanTermYears: 30, // 30 years (though typically short-term for flip)
    flipClosingCostsPercent: 2, // 2%
    contingencyPercent: FINANCIAL_CONFIG.flip.rehabContingencyPercent * 100, // 12%
    agentCommissionPercent: FINANCIAL_CONFIG.flip.saleCosts.agentCommissionPercent * 100, // 5%
    holdingMonths: FINANCIAL_CONFIG.flip.defaultRehabMonths, // 4
    // HML defaults
    hmlLtvPurchasePercent: FINANCIAL_CONFIG.hml.ltvPurchasePercent * 100, // 90%
    hmlLtvRehabPercent: FINANCIAL_CONFIG.hml.ltvRehabPercent * 100, // 100%
    hmlPointsPercent: FINANCIAL_CONFIG.hml.pointsPercent * 100, // 2%
    hmlInterestRate: FINANCIAL_CONFIG.hml.interestRate * 100, // 12%
    hmlProcessingFee: FINANCIAL_CONFIG.hml.processingFee, // $1500
    
    // Rental defaults
    rentalDownPaymentPercent: (1 - FINANCIAL_CONFIG.loan.ltvPercent) * 100, // 25%
    rentalInterestRate: FINANCIAL_CONFIG.loan.interestRate * 100, // 7.5%
    rentalLoanTermYears: FINANCIAL_CONFIG.loan.termYears, // 30
    rentalClosingCostsPercent: FINANCIAL_CONFIG.closingCostsPercent * 100, // 2%
    propertyManagementPercent: FINANCIAL_CONFIG.propertyManagementPercent * 100, // 10%
    maintenanceVacancyPercent: 12, // 12% reserves (maintenance + vacancy + capex)
    capexPercent: 0, // Deprecated - merged into maintenanceVacancyPercent
    
    // BRRRR defaults
    brrrrDownPaymentPercent: 25, // 25%
    brrrrInterestRate: 7.5, // 7.5%
    brrrrLoanTermYears: 30, // 30
    brrrrClosingCostsPercent: 2, // 2%
    refiLtvPercent: 75, // 75%
    refiClosingPercent: 2, // 2%
    
    // Legacy - maps to rental values for backward compatibility
    downPaymentPercent: (1 - FINANCIAL_CONFIG.loan.ltvPercent) * 100,
    interestRate: FINANCIAL_CONFIG.loan.interestRate * 100,
    loanTermYears: FINANCIAL_CONFIG.loan.termYears,
    closingCostsPercent: FINANCIAL_CONFIG.closingCostsPercent * 100,
  };
}

const defaultLoanDefaults = getDefaultLoanDefaults();

const defaultSettings: Settings = {
  themeMode: 'dark',
  designTheme: 'default',
  compactMode: false,
  showPercentages: true,
  defaultCurrency: 'USD',
  defaultAnalysisView: 'flip',
  analysisViewsOrder: ['flip', 'rental', 'brrrr'],
  autoSaveOverrides: false,
  numberFormat: 'comma',
  loanDefaults: defaultLoanDefaults,
  investmentScoreSettings: DEFAULT_INVESTMENT_SCORE_SETTINGS,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem('dealflow-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...defaultSettings,
        ...parsed,
        loanDefaults: { ...defaultLoanDefaults, ...(parsed.loanDefaults || {}) },
        investmentScoreSettings: { ...DEFAULT_INVESTMENT_SCORE_SETTINGS, ...(parsed.investmentScoreSettings || {}) },
      };
    }
    return defaultSettings;
  });

  // Calculate effective theme based on mode
  const getEffectiveTheme = (): 'light' | 'dark' => {
    if (settings.themeMode === 'auto') {
      const hour = new Date().getHours();
      // Dark from 7pm to 7am
      return (hour >= 19 || hour < 7) ? 'dark' : 'light';
    }
    return settings.themeMode;
  };

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(getEffectiveTheme);

  // Update effective theme when settings change or on interval for auto mode
  useEffect(() => {
    const updateTheme = () => setEffectiveTheme(getEffectiveTheme());
    updateTheme();

    if (settings.themeMode === 'auto') {
      // Check every minute for auto mode
      const interval = setInterval(updateTheme, 60000);
      return () => clearInterval(interval);
    }
  }, [settings.themeMode]);

  // Apply theme classes to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove('light', 'dark', 'theme-ocean', 'theme-sunset', 'theme-forest', 'compact');
    
    // Add current theme
    if (effectiveTheme === 'light') {
      root.classList.add('light');
    }
    
    // Add design theme
    if (settings.designTheme !== 'default') {
      root.classList.add(`theme-${settings.designTheme}`);
    }

    // Add compact mode
    if (settings.compactMode) {
      root.classList.add('compact');
    }
  }, [effectiveTheme, settings.designTheme, settings.compactMode]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('dealflow-settings', JSON.stringify(settings));
  }, [settings]);

  // Cross-tab sync — when another tab writes to dealflow-settings, mirror the
  // change here so theme/loan defaults/etc. stay consistent across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'dealflow-settings' || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        setSettings({
          ...defaultSettings,
          ...parsed,
          loanDefaults: { ...defaultLoanDefaults, ...(parsed.loanDefaults || {}) },
          investmentScoreSettings: { ...DEFAULT_INVESTMENT_SCORE_SETTINGS, ...(parsed.investmentScoreSettings || {}) },
        });
      } catch {
        // ignore malformed payloads from other tabs
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const updateLoanDefaults = (updates: Partial<LoanDefaults>) => {
    setSettings(prev => ({
      ...prev,
      loanDefaults: { ...prev.loanDefaults, ...updates }
    }));
  };

  const updateInvestmentScoreSettings = (updates: Partial<InvestmentScoreSettings>) => {
    setSettings(prev => ({
      ...prev,
      investmentScoreSettings: { ...prev.investmentScoreSettings, ...updates }
    }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateLoanDefaults, updateInvestmentScoreSettings, effectiveTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
