import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export type AppRole = 'admin' | 'investor' | 'agent';

export function useUserRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          setRole(null);
        } else if (data) {
          setRole(data.role as AppRole);
        } else {
          // No role found - might be a new user or investor without explicit role
          setRole(null);
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      fetchRole();
    }
  }, [user, authLoading]);

  const isAdmin = role === 'admin';
  const isInvestor = role === 'investor';
  const isAgent = role === 'agent';

  return {
    role,
    isAdmin,
    isInvestor,
    isAgent,
    loading: authLoading || loading,
  };
}
