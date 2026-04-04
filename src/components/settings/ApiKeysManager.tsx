import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Key, Plus, Copy, Trash2, Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function ApiKeysManager() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = async () => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } else {
      setKeys((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  // Hide completely for non-admins
  if (!roleLoading && !isAdmin) return null;

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .insert([{ name: newKeyName.trim() }])
        .select()
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        toast.error('Failed to create API key');
        return;
      }

      const created = data as any as ApiKey;
      setNewlyCreatedKey(created.key);
      setShowKey(prev => ({ ...prev, [created.id]: true }));
      setNewKeyName('');
      toast.success('API key created! Copy it now — you won\'t see it in full again.');
      fetchKeys();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: !currentActive })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update API key');
      return;
    }

    toast.success(currentActive ? 'API key deactivated' : 'API key activated');
    fetchKeys();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete API key');
      return;
    }

    toast.success('API key deleted');
    fetchKeys();
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const maskKey = (key: string) => {
    return key.slice(0, 8) + '••••••••••••••••' + key.slice(-4);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="w-5 h-5" />
          Your API Keys
        </CardTitle>
        <CardDescription>
          Keys you generate to give external apps or scripts access to this site's deal analysis API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create new key */}
        <div className="flex gap-2">
          <Input
            placeholder="Key name (e.g. Partner App, My Script)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </Button>
        </div>

        {/* Keys list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No API keys yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{apiKey.name}</span>
                    {apiKey.is_active ? (
                      <Badge variant="default" className="text-xs gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <XCircle className="w-3 h-3" /> Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground font-mono">
                      {showKey[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowKey(prev => ({ ...prev, [apiKey.id]: !prev[apiKey.id] }))}
                    >
                      {showKey[apiKey.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(apiKey.key)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Created: {formatDate(apiKey.created_at)}</span>
                    {apiKey.last_used_at && (
                      <span>Last used: {formatDate(apiKey.last_used_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(apiKey.id, apiKey.is_active)}
                    className="text-xs h-8"
                  >
                    {apiKey.is_active ? 'Deactivate' : 'Activate'}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the API key "{apiKey.name}". Any integrations using this key will stop working.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(apiKey.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
