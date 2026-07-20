import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/database/local_database.dart';
import 'core/database/local_repository.dart';
import 'core/network/api_client.dart';
import 'core/reports/report_service.dart';
import 'core/sync/sync_service.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/app_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const secureStorage = FlutterSecureStorage();
  final database = LocalDatabase(secureStorage);
  await database.initialize();
  final api = ApiClient(secureStorage);
  final sync = SyncService(database, api);
  final auth = AuthController(database, api, sync);
  final repository = LocalRepository(database);
  final reports = ReportService(database);
  runApp(
    FrequenciaItbApp(
      auth: auth,
      api: api,
      sync: sync,
      repository: repository,
      reports: reports,
    ),
  );
}

class FrequenciaItbApp extends StatefulWidget {
  const FrequenciaItbApp({
    super.key,
    required this.auth,
    required this.api,
    required this.sync,
    required this.repository,
    required this.reports,
  });

  final AuthController auth;
  final ApiClient api;
  final SyncService sync;
  final LocalRepository repository;
  final ReportService reports;

  @override
  State<FrequenciaItbApp> createState() => _FrequenciaItbAppState();
}

class _FrequenciaItbAppState extends State<FrequenciaItbApp> {
  late final GoRouter _router = GoRouter(
    initialLocation: '/login',
    refreshListenable: widget.auth,
    redirect: (_, state) {
      final authenticated = widget.auth.session != null;
      final login = state.matchedLocation == '/login';
      if (!authenticated && !login) return '/login';
      if (authenticated && login) return '/app';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/app', builder: (_, _) => const AppShell()),
    ],
  );

  @override
  Widget build(BuildContext context) => MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: widget.auth),
      ChangeNotifierProvider.value(value: widget.sync),
      Provider.value(value: widget.api),
      Provider.value(value: widget.repository),
      Provider.value(value: widget.reports),
    ],
    child: MaterialApp.router(
      title: 'Frequência ITB',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: _router,
    ),
  );
}
