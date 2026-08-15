import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/network/api_client.dart';
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
import '../replacements/replacements_screen.dart';
import '../reports/reports_screen.dart';
import '../students/students_screen.dart';
import '../users/users_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _Destination {
  const _Destination(
    this.label,
    this.icon,
    this.selectedIcon,
    this.page, {
    this.section = 'Principal',
  });
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget page;
  final String section;
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
      Icons.dashboard_rounded,
      DashboardScreen(),
      section: 'Acompanhamento',
    ),
    const _Destination(
      'Turmas',
      Icons.groups_outlined,
      Icons.groups_rounded,
      ClassesScreen(),
      section: 'Gestão Pedagógica',
    ),
    const _Destination(
      'Alunos',
      Icons.school_outlined,
      Icons.school_rounded,
      StudentsScreen(),
      section: 'Gestão Pedagógica',
    ),
    const _Destination(
      'Frequência',
      Icons.fact_check_outlined,
      Icons.fact_check_rounded,
      AttendanceScreen(),
      section: 'Acompanhamento',
    ),
    const _Destination(
      'Relatórios',
      Icons.description_outlined,
      Icons.description_rounded,
      ReportsScreen(),
      section: 'Gestão Pedagógica',
    ),
    const _Destination(
      'Reposição',
      Icons.event_repeat_outlined,
      Icons.event_repeat_rounded,
      ReplacementsScreen(),
      section: 'Acompanhamento',
    ),
    if (role.canManage)
      const _Destination(
        'Cursos',
        Icons.menu_book_outlined,
        Icons.menu_book_rounded,
        CoursesScreen(),
        section: 'Gestão Pedagógica',
      ),
    if (role.canManage)
      const _Destination(
        'Laboratórios',
        Icons.science_outlined,
        Icons.science_rounded,
        LaboratoriesScreen(),
        section: 'Gestão Pedagógica',
      ),
    if (role == UserRole.admin)
      const _Destination(
        'Usuários',
        Icons.manage_accounts_outlined,
        Icons.manage_accounts_rounded,
        UsersScreen(),
        section: 'Administração',
      ),
    if (role.canResolveConflicts)
      const _Destination(
        'Conflitos',
        Icons.compare_arrows_outlined,
        Icons.compare_arrows_rounded,
        ConflictsScreen(),
        section: 'Administração',
      ),
    if (role.canManage)
      const _Destination(
        'Auditoria',
        Icons.manage_history_outlined,
        Icons.manage_history_rounded,
        AuditScreen(),
        section: 'Administração',
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
              backgroundColor: Colors.white,
              child: SafeArea(
                child: Column(
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                      decoration: const BoxDecoration(
                        color: ItbColors.navy,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  color: ItbColors.cyan,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  session.name.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(
                                    color: ItbColors.navy,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      session.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      session.role.label,
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(
                          vertical: 12,
                          horizontal: 8,
                        ),
                        children: [
                          for (
                            var position = 0;
                            position < destinations.length;
                            position++
                          )
                            Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: ListTile(
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                selectedTileColor: ItbColors.blueLight,
                                selectedColor: ItbColors.blue,
                                selected: position == index,
                                leading: Icon(
                                  position == index
                                      ? destinations[position].selectedIcon
                                      : destinations[position].icon,
                                  color: position == index
                                      ? ItbColors.blue
                                      : ItbColors.textSecondary,
                                ),
                                title: Text(
                                  destinations[position].label,
                                  style: TextStyle(
                                    fontWeight: position == index
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                    color: position == index
                                        ? ItbColors.blue
                                        : ItbColors.textPrimary,
                                  ),
                                ),
                                onTap: () {
                                  setState(() => index = position);
                                  Navigator.pop(context);
                                },
                              ),
                            ),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        leading: const Icon(
                          Icons.logout,
                          color: ItbColors.red,
                        ),
                        title: const Text(
                          'Sair da conta',
                          style: TextStyle(
                            color: ItbColors.red,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        onTap: () => auth.logout(),
                      ),
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
                        color: Colors.white70,
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
                      Container(
                        height: kToolbarHeight + 4,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          border: Border(
                            bottom: BorderSide(
                              color: ItbColors.surfaceBorder,
                              width: 1,
                            ),
                          ),
                        ),
                        child: _topBar(auth, session, mobile: false),
                      ),
                      Expanded(child: content),
                    ],
                  ),
                ),
              ],
            )
          : content,
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
    elevation: 0,
    title: mobile
        ? Text(
            title ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          )
        : const SizedBox.shrink(),
    actions: [
      const _SyncAction(),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: PopupMenuButton<String>(
          tooltip: 'Conta',
          offset: const Offset(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: ItbColors.surfaceBorder),
          ),
          onSelected: (value) {
            if (value == 'logout') auth.logout();
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              enabled: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: ItbColors.navy,
                    ),
                  ),
                  Text(
                    session.role.label,
                    style: const TextStyle(
                      fontSize: 12,
                      color: ItbColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'logout',
              child: ListTile(
                leading: Icon(Icons.logout, color: ItbColors.red, size: 20),
                title: Text(
                  'Sair',
                  style: TextStyle(
                    color: ItbColors.red,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ],
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: ItbColors.cyan,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              session.name.substring(0, 1).toUpperCase(),
              style: const TextStyle(
                fontWeight: FontWeight.w900,
                color: ItbColors.navy,
                fontSize: 15,
              ),
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
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(
                auth.offline || sync.error != null
                    ? Icons.cloud_off_outlined
                    : Icons.cloud_done_outlined,
                color: auth.offline || sync.error != null
                    ? ItbColors.orange
                    : (sync.lastSync != null ? ItbColors.green : null),
              ),
      ),
    );
  }
}
