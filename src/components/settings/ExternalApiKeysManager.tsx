import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, Eye, EyeOff, Pencil, Save, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceKey {
  id: string;
  service_name: string;
  display_name: string;
  api_key: string | null;
  description: string | null;
  updated_at: string | null;
}

const SERVICE_ICONS: Record<string, string> = {
  dealbeast: '🏠',
  rapidapi:  '🔍',
  anthropic: '🤖',
};

export function ExternalApiKeysManager() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [keys, setKeys]   = useState<ServiceKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-row state
  const [editing,  setEditing]  = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [draft,    setDraft]    = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});

  const fetch = async () => {
    const { data, error } = await supabase
      .from('service_api_keys')
      .select('*')
      .order('service_name');
    if (error) {
      console.error('Error fetching service keys:', error);
      toast.error('Failed to load API keys');
    } else {
      setKeys((data as ServiceKey[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  if (!roleLoading && !isAdmin) return null;

  const startEdit = (key: ServiceKey) => {
    setDraft(prev => ({ ...prev, [key.id]: '' }));
    setEditing(prev => ({ ...prev, [key.id]: true }));
    setRevealed(prev => ({ ...prev, [key.id]: true }));
  };

  const cancelEdit = (id: string) => {
    setEditing(prev => ({ ...prev, [id]: false }));
    setDraft(prev => ({ ...prev, [id]: '' }));
    setRevealed(prev => ({ ...prev, [id]: false }));
  };

  const saveKey = async (key: ServiceKey) => {
    const newVal = draft[key.id]?.trim();
    if (!newVal) {
      toast.error('Please enter the API key value');
      return;
    }
    setSaving(prev => ({ ...prev, [key.id]: true }));
    const { error } = await supabase
      .from('service_api_keys')
      .update({ api_key: newVal })
      .eq('id', key.id);

    if (error) {
      toast.error('Failed to save key');
    } else {
      toast.success(`${key.display_name} key updated`);
      cancelEdit(key.id);
      fetch();
    }
    setSaving(prev => ({ ...prev, [key.id]: false }));
  };

  const maskKey = (k: string | null) => {
    if (!k) return null;
    const visible = Math.min(6, Math.floor(k.length * 0.25));
    return k.slice(0, visible) + '•'.repeat(Math.max(8, k.length - visible * 2)) + k.slice(-4);
  };

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          External API Keys
        </CardTitle>
        <CardDescription>
          API keys used by this app to connect to third-party services. Keys are stored securely and never exposed in full.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => {
              const isEditing  = !!editing[key.id];
              const isRevealed = !!revealed[key.id];
              const isSaving   = !!saving[key.id];
              const hasKey     = !!key.api_key;

              return (
                <div
                  key={key.id}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    isEditing ? "border-primary/50 bg-primary/5" : "bg-muted/30"
                  )}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SERVICE_ICONS[key.service_name] || '🔑'}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{key.display_name}</span>
                          {hasKey ? (
                            <Badge variant="default" className="text-xs gap-1 py-0">
                              <CheckCircle2 className="w-3 h-3" /> Configured
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs gap-1 py-0 text-warning border-warning/50">
                              <AlertCircle className="w-3 h-3" /> Not set
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{key.description}</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {!isEditing ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs shrink-0"
                        onClick={() => startEdit(key)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {hasKey ? 'Replace' : 'Add Key'}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => cancelEdit(key.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Key display / edit row */}
                  {hasKey && !isEditing && (
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                        {isRevealed ? key.api_key : maskKey(key.api_key)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setRevealed(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                        title={isRevealed ? 'Hide key' : 'Reveal key'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      {key.updated_at && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Updated {formatDate(key.updated_at)}
                        </span>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        type={isRevealed ? 'text' : 'password'}
                        placeholder={`Paste your ${key.display_name} API key here`}
                        value={draft[key.id] || ''}
                        onChange={(e) => setDraft(prev => ({ ...prev, [key.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveKey(key)}
                        className="flex-1 font-mono text-sm"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => setRevealed(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                      >
                        {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveKey(key)}
                        disabled={isSaving || !draft[key.id]?.trim()}
                        className="gap-1.5 shrink-0"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
