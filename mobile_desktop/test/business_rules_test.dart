import 'package:flutter_test/flutter_test.dart';
import 'package:frequencia_itb/core/business/business_rules.dart';
import 'package:frequencia_itb/core/models/models.dart';

void main() {
  group('AttendanceRules', () {
    test('professor edits through the seventh day only', () {
      final now = DateTime.utc(2026, 7, 20, 12);
      expect(
        AttendanceRules.professorCanEdit(DateTime.utc(2026, 7, 13), now),
        isTrue,
      );
      expect(
        AttendanceRules.professorCanEdit(DateTime.utc(2026, 7, 12), now),
        isFalse,
      );
      expect(
        AttendanceRules.professorCanEdit(DateTime.utc(2026, 7, 21), now),
        isFalse,
      );
    });

    test('calculates presence rate and risk bands', () {
      final rate = AttendanceRules.rate([
        AttendanceStatus.present,
        AttendanceStatus.present,
        AttendanceStatus.absent,
        AttendanceStatus.justified,
      ]);
      expect(rate, 50);
      expect(AttendanceRules.performanceLabel(rate), 'Crítico');
      expect(AttendanceRules.performanceLabel(80), 'Atenção');
      expect(AttendanceRules.performanceLabel(90), 'Regular');
    });

    test('supports the quick delayed marker', () {
      expect(AttendanceStatus.fromCode('A'), AttendanceStatus.delayed);
      expect(AttendanceStatus.delayed.label, 'Atraso');
      expect(UserRole.pedagogico.label, 'Administrativo / Secretaria');
    });
  });
}
