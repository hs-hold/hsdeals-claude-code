import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

const STORAGE_KEY = 'gmail_tokens';

export function useGmailAuth() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokens, setTokens] = useState<GmailTokens | null>(null);
  const { toast } = useToast();

  // Load tokens from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GmailTokens;
        // Check if token is expired
        if (parsed.expires_at && Date.now() < parsed.expires_at) {
          setTokens(parsed);
          setIsConnected(true);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code && !tokens) {
        setIsLoading(true);
        try {
          const redirectUri = window.location.origin;
          
          const { data, error } = await supabase.functions.invoke('gmail-exchange-token', {
            body: { code, redirect_uri: redirectUri }
          });

          if (error) throw error;
          
          if (data.success && data.access_token) {
            const newTokens: GmailTokens = {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: Date.now() + (data.expires_in * 1000),
            };
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newTokens));
            setTokens(newTokens);
            setIsConnected(true);
            
            toast({
              title: "Gmail Connected",
              description: "Successfully connected to your Gmail account",
            });
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            throw new Error(data.error || 'Failed to connect');
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
          toast({
            title: "Connection Failed",
            description: error instanceof Error ? error.message : "Failed to connect Gmail",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      }
    };

    handleCallback();
  }, [toast, tokens]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      const redirectUri = window.location.origin;
      
      const { data, error } = await supabase.functions.invoke('gmail-auth-url', {
        body: { redirect_uri: redirectUri }
      });

      if (error) throw error;
      
      if (data.success && data.auth_url) {
        // Check if running inside an iframe (e.g. Lovable preview)
        const isInIframe = window.self !== window.top;
        
        if (isInIframe) {
          // Use popup to escape iframe cookie restrictions
          const popup = window.open(data.auth_url, 'gmail-oauth', 'width=600,height=700');
          
          if (!popup) {
            toast({
              title: "Popup Blocked",
              description: "Please allow popups for this site to connect Gmail, then try again.",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }

          // Poll the popup for the OAuth code
          const pollTimer = setInterval(() => {
            try {
              if (popup.closed) {
                clearInterval(pollTimer);
                setIsLoading(false);
                return;
              }
              const popupUrl = popup.location.href;
              if (popupUrl.startsWith(redirectUri)) {
                clearInterval(pollTimer);
                const popupParams = new URLSearchParams(new URL(popupUrl).search);
                const code = popupParams.get('code');
                popup.close();
                
                if (code) {
                  // Exchange the code for tokens
                  (async () => {
                    try {
                      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('gmail-exchange-token', {
                        body: { code, redirect_uri: redirectUri }
                      });
                      if (tokenError) throw tokenError;
                      if (tokenData.success && tokenData.access_token) {
                        const newTokens: GmailTokens = {
                          access_token: tokenData.access_token,
                          refresh_token: tokenData.refresh_token,
                          expires_at: Date.now() + (tokenData.expires_in * 1000),
                        };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTokens));
                        setTokens(newTokens);
                        setIsConnected(true);
                        toast({ title: "Gmail Connected", description: "Successfully connected to your Gmail account" });
                      } else {
                        throw new Error(tokenData.error || 'Failed to connect');
                      }
                    } catch (err) {
                      console.error('Token exchange error:', err);
                      toast({ title: "Connection Failed", description: err instanceof Error ? err.message : "Failed to connect Gmail", variant: "destructive" });
                    } finally {
                      setIsLoading(false);
                    }
                  })();
                } else {
                  setIsLoading(false);
                }
              }
            } catch {
              // Cross-origin - popup hasn't redirected back yet
            }
          }, 500);
        } else {
          // Normal redirect flow for non-iframe contexts
          window.location.href = data.auth_url;
        }
      } else {
        throw new Error(data.error || 'Failed to get auth URL');
      }
    } catch (error) {
      console.error('Connect error:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to start Gmail connection",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [toast]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTokens(null);
    setIsConnected(false);
    toast({
      title: "Disconnected",
      description: "Gmail account disconnected",
    });
  }, [toast]);

  return {
    isConnected,
    isLoading,
    tokens,
    connect,
    disconnect,
  };
}
