import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/database/local_repository.dart';
import '../../core/models/models.dart';
import '../../core/sync/sync_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/itb_components.dart';
import '../auth/auth_controller.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  DateTime from = DateTime.now().subtract(const Duration(days: 29));
  DateTime to = DateTime.now();

  bool _isPreset(int days) {
    final today = DateUtils.dateOnly(DateTime.now());
    return DateUtils.isSameDay(DateUtils.dateOnly(to), today) &&
        DateUtils.isSameDay(
          DateUtils.dateOnly(from),
          today.subtract(Duration(days: days - 1)),
        );
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    context.watch<SyncService>();
    final session = context.watch<AuthController>().session!;
    final data = context.read<LocalRepository>().dashboard(
      session,
      from: from,
      to: to,
    );

    return RefreshIndicator(
      onRefresh: context.read<SyncService>().synchronize,
      child: ListView(
        padding: EdgeInsets.all(compact ? 16 : 24),
        children: [
          _Welcome(session: session),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Text(
                    'Período:',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: ItbColors.navy,
                      fontSize: 13,
                    ),
                  ),
                  ChoiceChip(
                    label: const Text('7 dias'),
                    selected: _isPreset(7),
                    onSelected: (_) => setState(() {
                      from = DateTime.now().subtract(const Duration(days: 6));
                      to = DateTime.now();
                    }),
                  ),
                  ChoiceChip(
                    label: const Text('30 dias'),
                    selected: _isPreset(30),
                    onSelected: (_) => setState(() {
                      from = DateTime.now().subtract(const Duration(days: 29));
                      to = DateTime.now();
                    }),
                  ),
                  ChoiceChip(
                    label: const Text('90 dias'),
                    selected: _isPreset(90),
                    onSelected: (_) => setState(() {
                      from = DateTime.now().subtract(const Duration(days: 89));
                      to = DateTime.now();
                    }),
                  ),
                  OutlinedButton.icon(
                    onPressed: _period,
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                    ),
                    icon: const Icon(Icons.date_range, size: 16),
                    label: Text(
                      '${DateFormat('dd/MM/yy').format(from)} – ${DateFormat('dd/MM/yy').format(to)}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              final cardWidth = compact
                  ? (constraints.maxWidth - 12) / 2
                  : (constraints.maxWidth - 48) / 5;
              return Wrap(
                spacing: compact ? 12 : 12,
                runSpacing: compact ? 12 : 12,
                children: [
                  ItbMetricCard(
                    width: cardWidth.clamp(140.0, 320.0),
                    compact: compact,
                    label: 'Frequência média',
                    value: '${data.globalRate.toStringAsFixed(1)}%',
                    icon: Icons.donut_large,
                    color: ItbColors.green,
                  ),
                  ItbMetricCard(
                    width: cardWidth.clamp(140.0, 320.0),
                    compact: compact,
                    label: 'Presenças',
                    value: '${data.present}',
                    icon: Icons.check_circle_outline,
                    color: ItbColors.blue,
                  ),
                  ItbMetricCard(
                    width: cardWidth.clamp(140.0, 320.0),
                    compact: compact,
                    label: 'Faltas',
                    value: '${data.absent}',
                    icon: Icons.cancel_outlined,
                    color: ItbColors.red,
                  ),
                  ItbMetricCard(
                    width: cardWidth.clamp(140.0, 320.0),
                    compact: compact,
                    label: 'Atrasos',
                    value: '${data.delayed}',
                    icon: Icons.schedule,
                    color: ItbColors.orange,
                  ),
                  ItbMetricCard(
                    width: cardWidth.clamp(140.0, 320.0),
                    compact: compact,
                    label: 'Risco de evasão',
                    value: '${data.riskStudents}',
                    icon: Icons.warning_amber_rounded,
                    color: ItbColors.orange,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 850;
              final charts = [
                Expanded(flex: 3, child: _EvolutionChart(data: data)),
                Expanded(flex: 2, child: _DistributionChart(data: data)),
              ];
              return wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        charts[0],
                        const SizedBox(width: 16),
                        charts[1],
                      ],
                    )
                  : Column(
                      children: [
                        SizedBox(
                          height: 340,
                          child: _EvolutionChart(data: data),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          height: 340,
                          child: _DistributionChart(data: data),
                        ),
                      ],
                    );
            },
          ),
          const SizedBox(height: 16),
          _ClassChart(data: data),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final cards = [
                Expanded(child: _AbsenteeRanking(data: data)),
                Expanded(child: _TeacherWorkloadCard(data: data)),
              ];
              return constraints.maxWidth >= 850
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        cards[0],
                        const SizedBox(width: 16),
                        cards[1],
                      ],
                    )
                  : Column(
                      children: [
                        SizedBox(height: 360, child: cards[0].child),
                        const SizedBox(height: 16),
                        SizedBox(height: 360, child: cards[1].child),
                      ],
                    );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _period() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: DateTimeRange(start: from, end: to),
    );
    if (range != null) {
      setState(() {
        from = range.start;
        to = range.end;
      });
    }
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome({required this.session});
  final UserSession session;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Olá, ${session.name.split(' ').first}',
        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: ItbColors.navy,
            ),
      ),
      const SizedBox(height: 4),
      Text(
        session.role == UserRole.professor
            ? 'Acompanhe hoje suas turmas e o engajamento dos seus alunos.'
            : 'Panorama pedagógico e indicadores de frequência da instituição.',
        style: const TextStyle(
          color: ItbColors.textSecondary,
          fontSize: 14,
        ),
      ),
    ],
  );
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title;
  final String subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: ItbColors.navy,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: const TextStyle(
              color: ItbColors.textSecondary,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 18),
          Expanded(child: child),
        ],
      ),
    ),
  );
}

class _EvolutionChart extends StatelessWidget {
  const _EvolutionChart({required this.data});
  final DashboardData data;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 340,
    child: _ChartCard(
      title: 'Evolução da presença',
      subtitle: 'Taxa média de frequência no período selecionado',
      child: data.evolution.isEmpty
          ? const _EmptyChart()
          : LineChart(
              LineChartData(
                minY: 0,
                maxY: 100,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: 25,
                  getDrawingHorizontalLine: (_) => const FlLine(
                    color: Color(0xFFF1F5F9),
                    strokeWidth: 1,
                  ),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  bottomTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 32,
                      interval: 25,
                      getTitlesWidget: (val, _) => Text(
                        '${val.toInt()}%',
                        style: const TextStyle(
                          color: ItbColors.textMuted,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < data.evolution.length; i++)
                        FlSpot(i.toDouble(), data.evolution[i].rate),
                    ],
                    isCurved: true,
                    color: ItbColors.blue,
                    barWidth: 3.5,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(
                      show: true,
                      color: ItbColors.blue.withValues(alpha: .08),
                    ),
                  ),
                ],
              ),
            ),
    ),
  );
}

class _DistributionChart extends StatelessWidget {
  const _DistributionChart({required this.data});
  final DashboardData data;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 340,
    child: _ChartCard(
      title: 'Distribuição de status',
      subtitle: 'Todos os lançamentos no escopo',
      child: data.present + data.absent + data.justified + data.delayed == 0
          ? const _EmptyChart()
          : PieChart(
              PieChartData(
                centerSpaceRadius: 52,
                sectionsSpace: 3,
                sections: [
                  PieChartSectionData(
                    value: data.present.toDouble(),
                    color: ItbColors.green,
                    title: 'P',
                    radius: 44,
                    titleStyle: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  PieChartSectionData(
                    value: data.absent.toDouble(),
                    color: ItbColors.red,
                    title: 'F',
                    radius: 44,
                    titleStyle: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  PieChartSectionData(
                    value: data.justified.toDouble(),
                    color: ItbColors.cyan,
                    title: 'J',
                    radius: 44,
                    titleStyle: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  PieChartSectionData(
                    value: data.delayed.toDouble(),
                    color: ItbColors.orange,
                    title: 'A',
                    radius: 48,
                    titleStyle: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
    ),
  );
}

class _ClassChart extends StatelessWidget {
  const _ClassChart({required this.data});
  final DashboardData data;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 380,
    child: _ChartCard(
      title: 'Comparativo por turma',
      subtitle: 'Percentual de presenças registradas',
      child: data.byClass.isEmpty
          ? const _EmptyChart()
          : BarChart(
              BarChartData(
                maxY: 100,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: 25,
                  getDrawingHorizontalLine: (_) => const FlLine(
                    color: Color(0xFFF1F5F9),
                    strokeWidth: 1,
                  ),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  bottomTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 32,
                      interval: 25,
                      getTitlesWidget: (val, _) => Text(
                        '${val.toInt()}%',
                        style: const TextStyle(
                          color: ItbColors.textMuted,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < data.byClass.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: data.byClass[i].attendanceRate,
                          width: 20,
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(6),
                          ),
                          color: data.byClass[i].attendanceRate < 75
                              ? ItbColors.red
                              : ItbColors.blue,
                        ),
                      ],
                    ),
                ],
              ),
            ),
    ),
  );
}

class _EmptyChart extends StatelessWidget {
  const _EmptyChart();
  @override
  Widget build(BuildContext context) => const Center(
    child: Text(
      'Os indicadores aparecerão após a primeira chamada.',
      textAlign: TextAlign.center,
      style: TextStyle(color: ItbColors.textMuted, fontSize: 13),
    ),
  );
}

class _AbsenteeRanking extends StatelessWidget {
  const _AbsenteeRanking({required this.data});
  final DashboardData data;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 360,
    child: _ChartCard(
      title: 'Alunos com mais faltas',
      subtitle: 'Prioridade de acompanhamento pedagógico no período',
      child: data.topAbsentees.isEmpty
          ? const _EmptyChart()
          : ListView.separated(
              itemCount: data.topAbsentees.length,
              separatorBuilder: (_, _) => const Divider(height: 14),
              itemBuilder: (_, index) {
                final item = data.topAbsentees[index];
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: index == 0
                          ? ItbColors.redBg
                          : ItbColors.surfaceMuted,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${index + 1}',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: index == 0
                            ? ItbColors.red
                            : ItbColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  title: Text(
                    item.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: ItbColors.navy,
                    ),
                  ),
                  subtitle: Text(
                    'Matrícula ${item.registrationNumber} • ${item.attendanceRate.toStringAsFixed(1)}% de presença',
                    style: const TextStyle(
                      fontSize: 12,
                      color: ItbColors.textSecondary,
                    ),
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: ItbColors.redBg,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${item.absences} F',
                      style: const TextStyle(
                        color: ItbColors.red,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                );
              },
            ),
    ),
  );
}

class _TeacherWorkloadCard extends StatelessWidget {
  const _TeacherWorkloadCard({required this.data});
  final DashboardData data;
  @override
  Widget build(BuildContext context) {
    final maxClasses = data.teacherWorkload.fold<int>(
      1,
      (max, item) => item.classes > max ? item.classes : max,
    );
    return SizedBox(
      height: 360,
      child: _ChartCard(
        title: 'Turmas por professor',
        subtitle: 'Carga e alcance no período selecionado',
        child: data.teacherWorkload.isEmpty
            ? const _EmptyChart()
            : ListView.separated(
                itemCount: data.teacherWorkload.length,
                separatorBuilder: (_, _) => const SizedBox(height: 14),
                itemBuilder: (_, index) {
                  final item = data.teacherWorkload[index];
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: ItbColors.navy,
                              ),
                            ),
                          ),
                          Text(
                            '${item.classes} turma(s) • ${item.students} aluno(s)',
                            style: const TextStyle(
                              fontSize: 12,
                              color: ItbColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: item.classes / maxClasses,
                          minHeight: 8,
                          backgroundColor: ItbColors.surfaceMuted,
                          valueColor: const AlwaysStoppedAnimation<Color>(
                            ItbColors.blue,
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
      ),
    );
  }
}
