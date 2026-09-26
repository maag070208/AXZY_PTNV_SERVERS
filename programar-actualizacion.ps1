<#
  Programa la actualizacion automatica de Puerto Nuevo todos los dias a la hora
  indicada (por defecto 3:00). Corre actualizar.sh dentro de WSL con el usuario
  actual y solo mientras tenga la sesion abierta. Si a esa hora la PC estaba
  apagada, se corre en cuanto vuelva a estar disponible. Resultado en logs\.

    Programar:  powershell -ExecutionPolicy Bypass -File programar-actualizacion.ps1
    Otra hora:  powershell -ExecutionPolicy Bypass -File programar-actualizacion.ps1 -Hora 04:30
    Quitar:     Unregister-ScheduledTask -TaskName "Puerto Nuevo - Actualizar" -Confirm:$false
#>
param([string]$Hora = "03:00")

$accion = New-ScheduledTaskAction -Execute "wsl.exe" `
    -Argument "--cd `"$PSScriptRoot`" -- bash ./actualizar.sh" `
    -WorkingDirectory $PSScriptRoot
$cuando = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Puerto Nuevo - Actualizar" -Action $accion -Trigger $cuando `
    -Settings $ajustes -Force `
    -Description "Respalda la base y baja la version nueva de Puerto Nuevo. Logs en $PSScriptRoot\logs" | Out-Null
Write-Host "Listo: Puerto Nuevo se actualizara solo todos los dias a las $Hora." -ForegroundColor Green
