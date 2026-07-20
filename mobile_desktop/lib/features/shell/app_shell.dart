import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
import '../../core/database/local_repository.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../attendance/attendance_screen.dart';
import '../audit/audit_screen.dart';
import '../auth/auth_controller.dart';
import '../classes/classes_screen.dart';
import '../conflicts/conflicts_screen.dart';
import '../courses/courses_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../laboratories/laboratories_screen.dart';
import '../reports/reports_screen.dart';
import '../students/students_screen.dart';
import '../users/users_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _Destination {
  const _Destination(this.label, this.icon, this.selectedIcon, this.page);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget page;
}

class _AppShellState extends State<AppShell> {
  int index = 0;
  bool collapsed = false;
  bool initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!initialized) {
      final userId = context.read<AuthController>().session!.id;
      collapsed = context.read<LocalRepository>().sidebarCollapsedFor(userId);
      initialized = true;
      Future.microtask(_loadUserDirectory);
    }
  }

  Future<void> _loadUserDirectory() async {
    final session = context.read<AuthController>().session!;
    if (!session.role.canManage) return;
    try {
      final response = await context.read<ApiClient>().get('/users');
      if (!mounted) return;
      context.read<LocalRepository>().replaceDirectoryUsers(
        (response['items'] as List).cast<Map<String, dynamic>>(),
      );
      setState(() {});
    } catch (_) {}
  }

  List<_Destination> _destinations(UserRole role) => [
    const _Destination(
      'Visão geral',
      Icons.dashboard_outlined,
      Icons.dashboard,
      DashboardScreen(),
    ),
    const _Destination(
      'Turmas',
      Icons.groups_outlined,
      Icons.groups,
      ClassesScreen(),
    ),
    const _Destination(
      'Alunos',
      Icons.school_outlined,
      Icons.school,
      StudentsScreen(),
    ),
    const _Destination(
      'Frequência',
      Icons.fact_check_outlined,
      Icons.fact_check,
      AttendanceScreen(),
    ),
    const _Destination(
      'Relatórios',
      Icons.description_outlined,
      Icons.description,
      ReportsScreen(),
    ),
    if (role.canManage)
      const _Destination(
        'Cursos',
        Icons.menu_book_outlined,
        Icons.menu_book,
        CoursesScreen(),
      ),
    if (role.canManage)
      const _Destination(
        'Laboratórios',
        Icons.science_outlined,
        Icons.science,
        LaboratoriesScreen(),
      ),
    if (role == UserRole.admin)
      const _Destination(
        'Usuários',
        Icons.manage_accounts_outlined,
        Icons.manage_accounts,
        UsersScreen(),
      ),
    if (role.canResolveConflicts)
      const _Destination(
        'Conflitos',
        Icons.compare_arrows_outlined,
        Icons.compare_arrows,
        ConflictsScreen(),
      ),
    if (role.canManage)
      const _Destination(
        'Auditoria',
        Icons.manage_history_outlined,
        Icons.manage_history,
        AuditScreen(),
      ),
  ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final session = auth.session!;
    final destinations = _destinations(session.role);
    if (index >= destinations.length) index = 0;
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final content = IndexedStack(
      index: index,
      children: destinations.map((item) => item.page).toList(),
    );
    return Scaffold(
      drawer: wide
          ? null
          : Drawer(
              child: SafeArea(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    Container(
                      color: ItbColors.navy,
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: ItbColors.cyan,
                            foregroundColor: ItbColors.navy,
                            child: Text(
                              session.name.substring(0, 1).toUpperCase(),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              session.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (
                      var position = 0;
                      position < destinations.length;
                      position++
                    )
                      ListTile(
                        selected: position == index,
                        leading: Icon(
                          position == index
                              ? destinations[position].selectedIcon
                              : destinations[position].icon,
                        ),
                        title: Text(destinations[position].label),
                        onTap: () {
                          setState(() => index = position);
                          Navigator.pop(context);
                        },
                      ),
                  ],
                ),
              ),
            ),
      appBar: wide
          ? null
          : _topBar(
              auth,
              session,
              mobile: true,
              title: destinations[index].label,
            ),
      body: wide
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: index,
                  onDestinationSelected: (value) =>
                      setState(() => index = value),
                  extended: !collapsed,
                  trailingAtBottom: true,
                  trailing: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: IconButton(
                      tooltip: collapsed ? 'Expandir menu' : 'Recolher menu',
                      onPressed: () {
                        setState(() => collapsed = !collapsed);
                        context.read<LocalRepository>().setSidebarCollapsed(
                          session.id,
                          collapsed,
                        );
                      },
                      icon: Icon(
                        collapsed
                            ? Icons.keyboard_double_arrow_right
                            : Icons.keyboard_double_arrow_left,
                      ),
                    ),
                  ),
                  destinations: [
                    for (final item in destinations)
                      NavigationRailDestination(
                        icon: Tooltip(
                          message: item.label,
                          child: Icon(item.icon),
                        ),
                        selectedIcon: Tooltip(
                          message: item.label,
                          child: Icon(item.selectedIcon),
                        ),
                        label: Text(item.label),
                      ),
                  ],
                ),
                Expanded(
                  child: Column(
                    children: [
                      SizedBox(
                        height: kToolbarHeight,
                        child: _topBar(auth, session, mobile: false),
                      ),
                      Expanded(child: content),
                    ],
                  ),
                ),
              ],
            )
          : content,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: index < 5 ? index : 0,
              labelBehavior:
                  NavigationDestinationLabelBehavior.onlyShowSelected,
              onDestinationSelected: (value) => setState(() => index = value),
              destinations: [
                for (final item in destinations.take(5))
                  NavigationDestination(
                    icon: Icon(item.icon),
                    selectedIcon: Icon(item.selectedIcon),
                    label: item.label,
                  ),
              ],
            ),
    );
  }

  AppBar _topBar(
    AuthController auth,
    UserSession session, {
    required bool mobile,
    String? title,
  }) => AppBar(
    primary: mobile,
    backgroundColor: mobile ? ItbColors.navy : Colors.white,
    foregroundColor: mobile ? Colors.white : ItbColors.navy,
    title: mobile
        ? Text(
            title ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          )
        : const SizedBox.shrink(),
    actions: [
      const _SyncAction(),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: PopupMenuButton<String>(
          tooltip: 'Conta',
          onSelected: (value) {
            if (value == 'logout') auth.logout();
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              enabled: false,
              child: Text(
                session.name,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'logout',
              child: ListTile(
                leading: Icon(Icons.logout),
                title: Text('Sair'),
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ],
          child: CircleAvatar(
            backgroundColor: ItbColors.cyan,
            foregroundColor: ItbColors.navy,
            child: Text(
              session.name.substring(0, 1).toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ),
      ),
      const SizedBox(width: 8),
    ],
  );
}

class _SyncAction extends StatelessWidget {
  const _SyncAction();
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final sync = context.watch<SyncService>();
    final message = auth.offline
        ? 'Modo offline'
        : sync.error ??
              (sync.lastSync == null ? 'Sincronizar' : 'Sincronizado');
    return Tooltip(
      message: message,
      child: IconButton(
        onPressed: auth.offline || sync.syncing ? null : sync.synchronize,
        icon: sync.syncing
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(
                auth.offline || sync.error != null
                    ? Icons.cloud_off_outlined
                    : Icons.cloud_done_outlined,
              ),
      ),
    );
  }
}
