import { KanbanBoard } from '@/components/deals/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';

export default function PipelinePage() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deal Pipeline</h1>
          <p className="text-muted-foreground">
            Track deals through your investment pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <KanbanBoard />
    </div>
  );
}
