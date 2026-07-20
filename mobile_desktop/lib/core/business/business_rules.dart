import '../models/models.dart';

class AttendanceRules {
  const AttendanceRules._();

  static bool professorCanEdit(DateTime classDate, DateTime now) {
    final dateOnly = DateTime(
      classDate.year,
      classDate.month,
      classDate.day,
      23,
      59,
      59,
      999,
    );
    if (dateOnly.isAfter(now)) return false;
    return now.difference(dateOnly).inMilliseconds <=
        const Duration(days: 7).inMilliseconds;
  }

  static double rate(Iterable<AttendanceStatus> records) {
    final values = records.toList(growable: false);
    if (values.isEmpty) return 0;
    final present = values
        .where((status) => status == AttendanceStatus.present)
        .length;
    return present * 100 / values.length;
  }

  static String performanceLabel(double rate) => switch (rate) {
    < 75 => 'Crítico',
    <= 85 => 'Atenção',
    _ => 'Regular',
  };
}
