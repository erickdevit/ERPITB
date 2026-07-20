[CmdletBinding()]
param(
  [string]$ApiBase = 'https://frequencia-itb-api.wx-f24.workers.dev',
  [Parameter(Mandatory = $true)]
  [string]$AdminEmail,
  [Parameter(Mandatory = $true)]
  [string]$AdminPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-ExpectedStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [Parameter(Mandatory = $true)]
    [hashtable]$Headers,
    [object]$Body,
    [Parameter(Mandatory = $true)]
    [int]$Expected
  )

  $arguments = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $arguments.ContentType = 'application/json'
    $arguments.Body = $Body | ConvertTo-Json -Depth 8
  }
  $response = Invoke-WebRequest @arguments
  if ($response.StatusCode -ne $Expected) {
    throw "$Method $Uri retornou $($response.StatusCode); esperado: $Expected. Corpo: $($response.Content)"
  }
  return $response
}

$ApiBase = $ApiBase.TrimEnd('/')
$loginBody = @{
  email = $AdminEmail
  password = $AdminPassword
} | ConvertTo-Json
$login = $null
for ($attempt = 1; $attempt -le 3 -and $null -eq $login; $attempt++) {
  try {
    $login = Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/login" -ContentType 'application/json' -Body $loginBody
  }
  catch {
    if ($attempt -eq 3) { throw }
    Start-Sleep -Seconds 2
  }
}
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$course = $null
$professor = $null
$class = $null
$student = $null
$results = [ordered]@{}

try {
  $results.health = (Invoke-ExpectedStatus -Method Get -Uri "$ApiBase/health" -Headers @{} -Body $null -Expected 200).StatusCode

  $professor = Invoke-RestMethod -Method Post -Uri "$ApiBase/users" -Headers $headers -ContentType 'application/json' -Body (@{
      name = 'Professor QA Temporario'
      email = "qa.prof.$suffix@example.invalid"
      role = 'professor'
      password = 'SenhaTemporariaQA!2026'
    } | ConvertTo-Json)
  $results.userCreate = 201
  $professor = Invoke-RestMethod -Method Patch -Uri "$ApiBase/users/$($professor.id)" -Headers $headers -ContentType 'application/json' -Body (@{
      name = 'Professor QA Atualizado'
      role = 'professor'
      active = $true
    } | ConvertTo-Json)
  $results.userUpdate = 200
  $course = Invoke-RestMethod -Method Post -Uri "$ApiBase/courses" -Headers $headers -ContentType 'application/json' -Body (@{
      code = "QA$suffix"
      name = 'Curso QA Temporario'
    } | ConvertTo-Json)

  $results.classWithoutProfessor = (Invoke-ExpectedStatus -Method Post -Uri "$ApiBase/classes" -Headers $headers -Body @{
      courseId = $course.id
      name = 'Turma sem professor'
      shift = 'manha'
    } -Expected 400).StatusCode

  $class = Invoke-RestMethod -Method Post -Uri "$ApiBase/classes" -Headers $headers -ContentType 'application/json' -Body (@{
      courseId = $course.id
      name = 'Turma QA Temporaria'
      shift = 'manha'
      teacherId = $professor.id
    } | ConvertTo-Json)

  $results.studentWithoutClass = (Invoke-ExpectedStatus -Method Post -Uri "$ApiBase/students" -Headers $headers -Body @{
      name = 'Aluno sem turma'
      registrationNumber = "SEM-$suffix"
    } -Expected 400).StatusCode

  $results.futureBirth = (Invoke-ExpectedStatus -Method Post -Uri "$ApiBase/students" -Headers $headers -Body @{
      classId = $class.id
      name = 'Aluno QA Futuro'
      registrationNumber = "FUT-$suffix"
      birthDate = '2999-01-01'
    } -Expected 400).StatusCode

  $student = Invoke-RestMethod -Method Post -Uri "$ApiBase/students" -Headers $headers -ContentType 'application/json' -Body (@{
      classId = $class.id
      name = 'Aluno QA Temporario'
      registrationNumber = "ALU-$suffix"
      birthDate = '2010-01-01'
    } | ConvertTo-Json)

  $results.linkedClassDelete = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/classes/$($class.id)" -Headers $headers -Body $null -Expected 409).StatusCode
  $results.linkedCourseDelete = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/courses/$($course.id)" -Headers $headers -Body $null -Expected 409).StatusCode

  $results.orphanProfessor = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/users/$($professor.id)" -Headers $headers -Body $null -Expected 409).StatusCode

  $query = [Uri]::EscapeDataString('Professor QA Atualizado')
  $filteredUsers = Invoke-RestMethod -Method Get -Uri "$ApiBase/users?role=professor&active=true&q=$query" -Headers $headers
  if (-not ($filteredUsers.items | Where-Object id -eq $professor.id)) {
    throw 'A busca combinada de professores ativos não retornou o usuário temporário.'
  }
  $results.combinedUserFilter = 200

  $dashboard = Invoke-RestMethod -Method Get -Uri "$ApiBase/dashboard?from=2026-01-01&to=2026-12-31" -Headers $headers
  if ($null -eq $dashboard.topAbsentees -or $null -eq $dashboard.teacherWorkload) {
    throw 'O dashboard não retornou os indicadores acionáveis esperados.'
  }
  $results.dashboardPeriod = 200
}
finally {
  if ($null -ne $student) {
    $results.cleanupStudent = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/students/$($student.id)" -Headers $headers -Body $null -Expected 200).StatusCode
  }
  if ($null -ne $class) {
    $results.cleanupClass = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/classes/$($class.id)" -Headers $headers -Body $null -Expected 200).StatusCode
  }
  if ($null -ne $professor) {
    $results.cleanupProfessor = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/users/$($professor.id)" -Headers $headers -Body $null -Expected 200).StatusCode
  }
  if ($null -ne $course) {
    $results.cleanupCourse = (Invoke-ExpectedStatus -Method Delete -Uri "$ApiBase/courses/$($course.id)" -Headers $headers -Body $null -Expected 200).StatusCode
  }
}

$results | ConvertTo-Json
