import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';
import 'package:sqlite3/open.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:uuid/uuid.dart';

class LocalDatabase {
  LocalDatabase(this._secureStorage) : _inMemory = false;
  LocalDatabase.inMemory()
    : _secureStorage = const FlutterSecureStorage(),
      _inMemory = true;

  final FlutterSecureStorage _secureStorage;
  final bool _inMemory;
  late final Database _db;
  bool _initialized = false;

  static const _keyName = 'frequencia_itb_database_key_v1';
  static const _uuid = Uuid();

  Future<void> initialize() async {
    if (_initialized) return;
    if (_inMemory) {
      _db = sqlite3.openInMemory();
      _db.execute('PRAGMA foreign_keys = ON;');
      _db.execute(_schema);
      _migrate();
      _initialized = true;
      return;
    }
    if (Platform.isAndroid) {
      open.overrideFor(OperatingSystem.android, openCipherOnAndroid);
    }
    var key = await _secureStorage.read(key: _keyName);
    if (key == null) {
      final random = Random.secure();
      key = List<int>.generate(
        32,
        (_) => random.nextInt(256),
      ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
      await _secureStorage.write(key: _keyName, value: key);
    }
    final directory = await getApplicationSupportDirectory();
    await directory.create(recursive: true);
    _db = sqlite3.open(p.join(directory.path, 'frequencia_itb.db'));
    _db.execute('PRAGMA key = "x\'$key\'";');
    final cipher = _db.select('PRAGMA cipher_version;');
    if (cipher.isEmpty) {
      _db.dispose();
      throw StateError(
        'SQLCipher não foi carregado; o banco local não será aberto em texto puro.',
      );
    }
    _db.execute('PRAGMA foreign_keys = ON;');
    _db.execute('PRAGMA journal_mode = WAL;');
    _db.execute(_schema);
    _migrate();
    _initialized = true;
  }

  void _migrate() {
    final studentColumns = _db.select('PRAGMA table_info(students)');
    if (!studentColumns.any((row) => row['name'] == 'birth_date')) {
      _db.execute('ALTER TABLE students ADD COLUMN birth_date TEXT');
    }
  }

  List<Map<String, Object?>> select(
    String sql, [
    List<Object?> parameters = const [],
  ]) => _db
      .select(sql, parameters)
      .map((row) => Map<String, Object?>.from(row))
      .toList();

  void execute(String sql, [List<Object?> parameters = const []]) =>
      _db.execute(sql, parameters);

  void dispose() {
    if (_initialized) _db.dispose();
    _initialized = false;
  }

  T transaction<T>(T Function() action) {
    _db.execute('BEGIN IMMEDIATE;');
    try {
      final result = action();
      _db.execute('COMMIT;');
      return result;
    } catch (_) {
      _db.execute('ROLLBACK;');
      rethrow;
    }
  }

  void saveSession(Map<String, Object?> user) {
    execute(
      '''INSERT INTO cached_session (singleton, user_json, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET user_json = excluded.user_json, updated_at = excluded.updated_at''',
      [jsonEncode(user), DateTime.now().toUtc().toIso8601String()],
    );
  }

  Map<String, dynamic>? cachedSession() {
    final rows = select(
      'SELECT user_json FROM cached_session WHERE singleton = 1',
    );
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['user_json']! as String)
        as Map<String, dynamic>;
  }

  void saveOfflineVerifier({
    required String userId,
    required String email,
    required String salt,
    required String verifier,
  }) {
    execute(
      '''INSERT INTO offline_auth (user_id, email, salt, verifier, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, salt = excluded.salt,
           verifier = excluded.verifier, updated_at = excluded.updated_at''',
      [
        userId,
        email.toLowerCase(),
        salt,
        verifier,
        DateTime.now().toUtc().toIso8601String(),
      ],
    );
  }

  Map<String, Object?>? offlineVerifier(String email) {
    final rows = select('SELECT * FROM offline_auth WHERE email = ?', [
      email.toLowerCase(),
    ]);
    return rows.isEmpty ? null : rows.first;
  }

  String enqueue({
    required String entity,
    required String entityId,
    required String action,
    required int baseVersion,
    required Map<String, Object?> data,
  }) {
    final existing = select(
      'SELECT operation_id FROM sync_queue WHERE entity_name = ? AND entity_id = ?',
      [entity, entityId],
    );
    final operationId = existing.isEmpty
        ? _uuid.v4()
        : existing.first['operation_id']! as String;
    execute(
      '''INSERT INTO sync_queue (operation_id, entity_name, entity_id, action, base_version, data_json, updated_at, attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(entity_name, entity_id) DO UPDATE SET action = excluded.action,
           data_json = excluded.data_json, updated_at = excluded.updated_at''',
      [
        operationId,
        entity,
        entityId,
        action,
        baseVersion,
        jsonEncode(data),
        DateTime.now().toUtc().toIso8601String(),
      ],
    );
    return operationId;
  }

  List<Map<String, Object?>> pendingOperations() {
    final rows = select('SELECT * FROM sync_queue ORDER BY rowid LIMIT 201');
    if (rows.length <= 200) return rows;
    final selected = rows.take(200).toList();
    final last = selected.last;
    final next = rows[200];
    final entity = last['entity_name'];
    if (entity == 'classes' || entity == 'students') {
      final relation =
          jsonDecode(next['data_json']! as String) as Map<String, dynamic>;
      final parentId = last['entity_id'];
      final paired = entity == 'classes'
          ? next['entity_name'] == 'class_teachers' &&
                relation['class_id'] == parentId
          : next['entity_name'] == 'enrollments' &&
                relation['student_id'] == parentId;
      if (paired) selected.removeLast();
    }
    return selected;
  }

  int get syncCursor {
    final rows = select("SELECT value FROM app_meta WHERE key = 'sync_cursor'");
    return rows.isEmpty ? 0 : int.tryParse(rows.first['value']! as String) ?? 0;
  }

  String? meta(String key) {
    final rows = select('SELECT value FROM app_meta WHERE key = ?', [key]);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  void setMeta(String key, String value) => execute(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );

  set syncCursor(int value) => execute(
    "INSERT INTO app_meta (key, value) VALUES ('sync_cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [value.toString()],
  );

  void completeOperation(String operationId, int version) {
    final queued = select(
      'SELECT entity_name, entity_id FROM sync_queue WHERE operation_id = ?',
      [operationId],
    );
    if (queued.isEmpty) return;
    final entity = queued.first['entity_name']! as String;
    final id = queued.first['entity_id']! as String;
    transaction(() {
      execute('DELETE FROM sync_queue WHERE operation_id = ?', [operationId]);
      if (_syncTables.contains(entity)) {
        execute(
          "UPDATE $entity SET sync_version = ?, sync_status = 'SYNCED' WHERE id = ?",
          [version, id],
        );
      }
    });
  }

  void markConflict(String operationId, String conflictId) {
    final queued = select(
      'SELECT entity_name, entity_id, data_json FROM sync_queue WHERE operation_id = ?',
      [operationId],
    );
    if (queued.isEmpty) return;
    final row = queued.first;
    transaction(() {
      execute('DELETE FROM sync_queue WHERE operation_id = ?', [operationId]);
      execute(
        '''INSERT OR REPLACE INTO local_conflicts (id, entity_name, entity_id, local_data_json, status, created_at)
           VALUES (?, ?, ?, ?, 'PENDING', ?)''',
        [
          conflictId,
          row['entity_name'],
          row['entity_id'],
          row['data_json'],
          DateTime.now().toUtc().toIso8601String(),
        ],
      );
      if (_syncTables.contains(row['entity_name'])) {
        execute(
          "UPDATE ${row['entity_name']} SET sync_status = 'CONFLICT' WHERE id = ?",
          [row['entity_id']],
        );
      }
    });
  }

  void rejectOperation(String operationId, String message) {
    final queued = select(
      'SELECT entity_name, entity_id, data_json FROM sync_queue WHERE operation_id = ?',
      [operationId],
    );
    if (queued.isEmpty) return;
    final row = queued.first;
    transaction(() {
      execute('DELETE FROM sync_queue WHERE operation_id = ?', [operationId]);
      execute(
        '''INSERT OR REPLACE INTO local_conflicts
             (id, entity_name, entity_id, local_data_json, remote_data_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'REJECTED', ?)''',
        [
          'rejected-$operationId',
          row['entity_name'],
          row['entity_id'],
          row['data_json'],
          jsonEncode({'message': message}),
          DateTime.now().toUtc().toIso8601String(),
        ],
      );
      if (_syncTables.contains(row['entity_name'])) {
        execute(
          "UPDATE ${row['entity_name']} SET sync_status = 'CONFLICT' WHERE id = ?",
          [row['entity_id']],
        );
      }
    });
  }

  void dismissConflict(String conflictId, Map<String, dynamic>? remoteData) {
    transaction(() {
      if (remoteData != null) {
        applyRemoteChange('attendance_records', 'upsert', remoteData);
      }
      execute('DELETE FROM local_conflicts WHERE id = ?', [conflictId]);
    });
  }

  void applyRemoteChange(
    String entity,
    String action,
    Map<String, dynamic> data,
  ) {
    if (!_allowedColumns.containsKey(entity)) return;
    final id = data['id'] as String?;
    if (id == null) return;
    if (select(
      'SELECT 1 FROM sync_queue WHERE entity_name = ? AND entity_id = ?',
      [entity, id],
    ).isNotEmpty) {
      return;
    }
    if (action == 'delete') {
      execute('DELETE FROM $entity WHERE id = ?', [id]);
      return;
    }
    final allowed = _allowedColumns[entity]!;
    final payload = <String, Object?>{'id': id};
    for (final entry in data.entries) {
      if (allowed.contains(entry.key)) payload[entry.key] = entry.value;
    }
    if (_syncTables.contains(entity)) payload['sync_status'] = 'SYNCED';
    final fields = payload.keys.toList();
    final updates = fields
        .where((field) => field != 'id')
        .map((field) => '$field = excluded.$field')
        .join(', ');
    execute(
      'INSERT INTO $entity (${fields.join(', ')}) VALUES (${List.filled(fields.length, '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET $updates',
      fields.map((field) => payload[field]).toList(),
    );
  }

  static const _syncTables = {
    'courses',
    'classes',
    'class_teachers',
    'students',
    'enrollments',
    'attendance_records',
    'class_notes',
  };
  static const _allowedColumns = <String, Set<String>>{
    'courses': {
      'id',
      'code',
      'name',
      'active',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'classes': {
      'id',
      'course_id',
      'name',
      'shift',
      'active',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'class_teachers': {
      'id',
      'class_id',
      'user_id',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'students': {
      'id',
      'name',
      'cpf',
      'contact',
      'registration_number',
      'birth_date',
      'active',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'enrollments': {
      'id',
      'class_id',
      'student_id',
      'status',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'attendance_records': {
      'id',
      'class_id',
      'student_id',
      'date',
      'status',
      'notes',
      'recorded_by_user_id',
      'sync_status',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
    'class_notes': {
      'id',
      'class_id',
      'date',
      'notes',
      'recorded_by_user_id',
      'sync_version',
      'created_at',
      'updated_at',
      'deleted_at',
    },
  };

  static const _schema = '''
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cached_session (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), user_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS offline_auth (user_id TEXT NOT NULL, email TEXT PRIMARY KEY COLLATE NOCASE, salt TEXT NOT NULL, verifier TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, shift TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS class_teachers (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT NOT NULL, sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, cpf TEXT, contact TEXT, registration_number TEXT NOT NULL, birth_date TEXT, active INTEGER NOT NULL DEFAULT 1, sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ativa', sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(class_id, student_id));
CREATE TABLE IF NOT EXISTS attendance_records (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, student_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, notes TEXT, recorded_by_user_id TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'SYNCED', sync_version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(class_id, student_id, date));
CREATE TABLE IF NOT EXISTS class_notes (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, date TEXT NOT NULL, notes TEXT, recorded_by_user_id TEXT NOT NULL, sync_version INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'SYNCED', deleted_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(class_id, date));
CREATE TABLE IF NOT EXISTS user_directory (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS sync_queue (operation_id TEXT PRIMARY KEY, entity_name TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, base_version INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(entity_name, entity_id));
CREATE TABLE IF NOT EXISTS local_conflicts (id TEXT PRIMARY KEY, entity_name TEXT NOT NULL, entity_id TEXT NOT NULL, local_data_json TEXT NOT NULL, remote_data_json TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, date);
''';
}
