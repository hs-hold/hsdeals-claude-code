import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Telescope, ArrowLeft, LogOut, Sparkles, Search, Star, XCircle, ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ScoutLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="w-3.5 h-3.5" />
            DealFlow
          </Link>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <Telescope className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">Scout</span>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-400/30 text-[10px] h-4">Beta</Badge>
          </div>
          <span className="text-border">|</span>
          {/* Sub-nav */}
          <nav className="flex items-center gap-1">
            <Link to="/scout" className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              location.pathname === '/scout'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}>
              <Search className="w-3.5 h-3.5" /> Search
            </Link>
            <Link to="/scout/ai-analyzed" className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              location.pathname === '/scout/ai-analyzed'
                ? 'bg-violet-500/15 text-violet-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}>
              <Sparkles className="w-3.5 h-3.5" /> AI Analyzed
            </Link>
            <Link to="/scout/favorites" className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              location.pathname === '/scout/favorites'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}>
              <Star className="w-3.5 h-3.5" /> Favorites
            </Link>
            <Link to="/scout/not-relevant" className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              location.pathname === '/scout/not-relevant'
                ? 'bg-zinc-500/15 text-zinc-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}>
              <XCircle className="w-3.5 h-3.5" /> Not Relevant
            </Link>
            <Link to="/scout/deal-scanner" className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              location.pathname.startsWith('/scout/deal-scanner')
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}>
              <ScanLine className="w-3.5 h-3.5" /> Pipeline
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="h-7 px-2 text-xs text-muted-foreground">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
