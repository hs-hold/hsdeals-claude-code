import { ReactNode } from 'react';
import { AutoScanBanner } from '@/components/layout/AutoScanBanner';
import { GlobalScanProgress } from '@/components/layout/GlobalScanProgress';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { StateSelector } from '@/components/layout/StateSelector';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Building2, 
  Ban, 
  Columns3,
  TrendingUp,
  ScanSearch,
  Settings,
  LogOut,
  CheckCircle2,
  Inbox,
  Mail,
  Users,
  Flame,
  Wifi,
  ChevronRight,
  Bot,
  Telescope,
  Calendar,
  CalendarDays,
  Star,
  MapPin,
  Search,
  UserCog,
  ClipboardList,
  BookOpen,
  Activity,
  BarChart2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
];

const analyzeSubItems = [
  { to: '/analyze/address', label: 'By Address', icon: MapPin },
  { to: '/analyze/market', label: 'Market Search', icon: Search },
  { to: '/analyze/email', label: 'Email Search', icon: Mail },
  { to: '/analyze/market-scan', label: 'Market Scan', icon: ScanSearch },
];

const hotDealsSubItems = [
  { to: '/hot-deals', label: 'All Hot Deals', icon: Flame },
  { to: '/hot-deals?filter=today', label: 'Today', icon: Calendar },
  { to: '/hot-deals?filter=week', label: 'This Week', icon: CalendarDays },
  { to: '/hot-deals?filter=top', label: 'Top Rated (9+)', icon: Star },
  { to: '/hot-deals/claude-picks', label: "Claude's Picks", icon: Bot },
];

const dealsNavItems = [
  { to: '/new-deals', icon: Inbox, label: 'New Deals' },
  { to: '/potential-deals', icon: TrendingUp, label: 'Potential Off-Market' },
  { to: '/potential-market-deals', icon: BarChart2, label: 'Potential Market' },
  { to: '/deals', icon: Building2, label: 'Analyzed' },
  { to: '/pipeline', icon: Columns3, label: 'Pipeline' },
  { to: '/closed', icon: CheckCircle2, label: 'Closed' },
  { to: '/not-relevant', icon: Ban, label: 'Not Relevant' },
];

const otherNavItems = [
  { to: '/scout', icon: Telescope, label: 'Scout (Beta)' },
  { to: '/gmail-history', icon: Mail, label: 'Gmail History' },
  { to: '/investors', icon: Users, label: 'Investors' },
];

const agentsApiSubItems = [
  { to: '/api-deals', label: 'API Deals', icon: Wifi },
  { to: '/api-activity', label: 'Live Activity', icon: Activity },
  { to: '/agent-management', label: 'Agent Management', icon: UserCog },
  { to: '/api-docs', label: 'API Documentation', icon: BookOpen },
];

// Agent-specific analyze items (no email by default)
const agentAnalyzeSubItems = [
  { to: '/analyze/address', label: 'By Address', icon: MapPin },
  { to: '/analyze/market', label: 'Market Search', icon: Search },
];

function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isAgent, isAdmin } = useUserRole();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const currentPath = location.pathname + location.search;
  const isHotDealsActive = location.pathname === '/hot-deals';
  const isAnalyzeActive = location.pathname.startsWith('/analyze');
  const isAgentsApiActive = ['/api-deals', '/agent-management', '/api-docs', '/api-activity'].includes(location.pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-2 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-base font-bold text-foreground truncate">DealFlow</h1>
                <p className="text-xs text-muted-foreground truncate">Real Estate CRM</p>
              </div>
            </div>
            <SidebarTrigger className="hidden md:flex shrink-0" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <SidebarTrigger className="hidden md:flex" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Agent sidebar */}
        {isAgent ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === '/agent-deals'}
                      tooltip="My Deals"
                    >
                      <Link to="/agent-deals" onClick={handleNavClick}>
                        <ClipboardList className="w-5 h-5" />
                        <span>My Deals</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Analyze collapsible for agent */}
                  <Collapsible asChild defaultOpen={isAnalyzeActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isAnalyzeActive}
                          tooltip="Analyze"
                        >
                          <ScanSearch className="w-5 h-5" />
                          <span>Analyze</span>
                          <ChevronRight className="ml-auto w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {agentAnalyzeSubItems.map((sub) => (
                            <SidebarMenuSubItem key={sub.to}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location.pathname === sub.to}
                              >
                                <Link to={sub.to} onClick={handleNavClick}>
                                  <sub.icon className="w-3.5 h-3.5 mr-1" />
                                  <span>{sub.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <>
            {/* Admin sidebar - same as before */}
            {/* Main */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.to}
                        tooltip={item.label}
                      >
                        <Link to={item.to} onClick={handleNavClick}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}

                  {/* Analyze collapsible */}
                  <Collapsible asChild defaultOpen={isAnalyzeActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isAnalyzeActive}
                          tooltip="Analyze"
                        >
                          <ScanSearch className="w-5 h-5" />
                          <span>Analyze</span>
                          <ChevronRight className="ml-auto w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {analyzeSubItems.map((sub) => (
                            <SidebarMenuSubItem key={sub.to}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location.pathname === sub.to}
                              >
                                <Link to={sub.to} onClick={handleNavClick}>
                                  <sub.icon className="w-3.5 h-3.5 mr-1" />
                                  <span>{sub.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>

                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Deals */}
            <SidebarGroup>
              <SidebarGroupLabel>Deals</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* New Deals — first item */}
                  {dealsNavItems.slice(0, 1).map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
                        <Link to={item.to} onClick={handleNavClick}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}

                  {/* Hot Deals */}
                  <Collapsible asChild defaultOpen={isHotDealsActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={isHotDealsActive} tooltip="Hot Deals">
                          <Flame className="w-5 h-5" />
                          <span>Hot Deals</span>
                          <ChevronRight className="ml-auto w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {hotDealsSubItems.map((sub) => (
                            <SidebarMenuSubItem key={sub.to}>
                              <SidebarMenuSubButton asChild isActive={currentPath === sub.to || (sub.to === '/hot-deals' && location.pathname === '/hot-deals' && !location.search)}>
                                <Link to={sub.to} onClick={handleNavClick}>
                                  <sub.icon className="w-3.5 h-3.5 mr-1" />
                                  <span>{sub.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>

                  {/* Remaining deals items */}
                  {dealsNavItems.slice(1).map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.to}
                        tooltip={item.label}
                      >
                        <Link to={item.to} onClick={handleNavClick}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Tools */}
            <SidebarGroup>
              <SidebarGroupLabel>Tools</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {otherNavItems.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.to}
                        tooltip={item.label}
                      >
                        <Link to={item.to} onClick={handleNavClick}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Agents & API */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible asChild defaultOpen={isAgentsApiActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isAgentsApiActive}
                          tooltip="Agents & API"
                        >
                          <Wifi className="w-5 h-5" />
                          <span>Agents & API</span>
                          <ChevronRight className="ml-auto w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {agentsApiSubItems.map((sub) => (
                            <SidebarMenuSubItem key={sub.to}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location.pathname === sub.to}
                              >
                                <Link to={sub.to} onClick={handleNavClick}>
                                  <sub.icon className="w-3.5 h-3.5 mr-1" />
                                  <span>{sub.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
        <div className={cn("px-1", isCollapsed && "flex justify-center")}>
          <StateSelector collapsed={isCollapsed} />
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === '/settings'}
              tooltip="Settings"
            >
              <Link to="/settings" onClick={handleNavClick}>
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        {!isCollapsed && user && (
          <div className="px-2 py-1 text-xs text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Logout">
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!isCollapsed && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            All values in USD
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileHeader() {
  return (
    <header className="flex items-center h-14 px-4 border-b border-border bg-background md:hidden">
      <SidebarTrigger className="mr-3" />
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <span className="font-bold">DealFlow</span>
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileHeader />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      {/* Global floating components — visible from any page */}
      <AutoScanBanner />
      <GlobalScanProgress />
    </SidebarProvider>
  );
}
