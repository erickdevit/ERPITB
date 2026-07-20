import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../database/local_database.dart';
import '../network/api_client.dart';

class SyncService extends ChangeNotifier {
  SyncService(this._database, this._api);

  final LocalDatabase _database;
  final ApiClient _api;
  bool syncing = false;
  DateTime? lastSync;
  String? error;

  Future<void> synchronize() async {
    if (syncing) return;
    syncing = true;
    error = null;
    notifyListeners();
    try {
      await _push();
      await _pullAll();
      lastSync = DateTime.now();
    } on NetworkUnavailable {
      error = 'Sem conexão — alterações protegidas no dispositivo.';
    } on ApiException catch (exception) {
      error = exception.message;
    } catch (_) {
      error = 'Não foi possível concluir a sincronização.';
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<void> _push() async {
    final queued = _database.pendingOperations();
    if (queued.isEmpty) return;
    final operations = queued
        .map(
          (row) => {
            'operationId': row['operation_id'],
            'entity': row['entity_name'],
            'action': row['action'],
            'id': row['entity_id'],
            'baseVersion': row['base_version'],
            'updatedAt': row['updated_at'],
            'data': jsonDecode(row['data_json']! as String),
          },
        )
        .toList();
    final result = await _api.post('/sync/push', {
      'deviceId': await _deviceId(),
      'operations': operations,
    });
    for (final raw in result['results'] as List<dynamic>? ?? const []) {
      final item = raw as Map<String, dynamic>;
      if (item['status'] == 'applied') {
        _database.completeOperation(
          item['operationId'] as String,
          item['version'] as int,
        );
      } else if (item['status'] == 'conflict') {
        _database.markConflict(
          item['operationId'] as String,
          item['conflictId'] as String,
        );
      } else if (item['status'] == 'rejected') {
        _database.rejectOperation(
          item['operationId'] as String,
          item['message'] as String? ?? 'Operação rejeitada pelo servidor.',
        );
      }
    }
  }

  Future<void> _pullAll() async {
    var hasMore = true;
    while (hasMore) {
      final result = await _api.get(
        '/sync/pull?cursor=${_database.syncCursor}&limit=200',
      );
      for (final raw in result['changes'] as List<dynamic>? ?? const []) {
        final change = raw as Map<String, dynamic>;
        _database.applyRemoteChange(
          change['entity'] as String,
          change['operation'] as String,
          change['data'] as Map<String, dynamic>,
        );
      }
      _database.syncCursor =
          result['nextCursor'] as int? ?? _database.syncCursor;
      hasMore = result['hasMore'] as bool? ?? false;
    }
  }

  Future<String> _deviceId() async {
    final rows = _database.select(
      "SELECT value FROM app_meta WHERE key = 'device_id'",
    );
    if (rows.isNotEmpty) return rows.first['value']! as String;
    final value =
        '${defaultTargetPlatform.name}-${DateTime.now().microsecondsSinceEpoch}';
    _database.execute(
      "INSERT INTO app_meta (key, value) VALUES ('device_id', ?)",
      [value],
    );
    return value;
  }
}
