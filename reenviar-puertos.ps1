<#
  Reenvia los puertos de Puerto Nuevo de Windows hacia WSL, para que las otras
  computadoras y los celulares entren por la IP de este servidor (web 8080,
  API 4001). Docker dentro de WSL solo publica los puertos hacia esta misma
  Windows; el reenvio (netsh portproxy) es lo que los abre a la red.

  Escucha en todas las direcciones (0.0.0.0): si cambia la IP del servidor no
  hay que tocar nada. Lo que si cambia es la direccion interna de WSL, en cada
  reinicio; por eso -Programar deja una tarea que lo rehace al iniciar sesion.

  Abre PowerShell como administrador, con el mismo usuario que usa WSL:

    Una vez:       powershell -ExecutionPolicy Bypass -File reenviar-puertos.ps1
    Y programarlo: powershell -ExecutionPolicy Bypass -File reenviar-puertos.ps1 -Programar
    Con firewall:  agrega -AbrirFirewall (crea la regla de entrada de los dos puertos)
    Quitar:        Unregister-ScheduledTask -TaskName "Puerto Nuevo - Reenviar puertos" -Confirm:$false

  Cada corrida deja una linea en logs\reenviar-puertos.log.
  Solo usa ASCII: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI.
#>
param(
    [switch]$Programar,
    [switch]$AbrirFirewall
)

$puertos = 8080, 4001
$nombre = "Puerto Nuevo - Reenviar puertos"
$registro = Join-Path $PSScriptRoot "logs\reenviar-puertos.log"

# Tambien al log: programada corre sin ventana y nadie ve la pantalla.
function Anotar([string]$texto, [string]$color = "Gray") {
    Write-Host $texto -ForegroundColor $color
    New-Item -ItemType Directory -Force -Path (Split-Path $registro) | Out-Null
    Add-Content -LiteralPath $registro -Encoding ASCII -Value ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $texto)
}

function Fallar([string]$texto) {
    Anotar "ERROR: $texto" "Red"
    exit 1
}

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$esAdmin = ([Security.Principal.WindowsPrincipal]$identidad).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { Fallar "Hay que abrir PowerShell como administrador." }

# La primera direccion de `hostname -I` es la de WSL; las demas son redes de
# Docker. Recien prendida la PC, WSL tarda en arrancar: se espera hasta 90 s.
function DireccionWsl {
    $limite = (Get-Date).AddSeconds(90)
    do {
        $salida = (wsl.exe hostname -I 2>$null | Out-String).Trim()
        if ($salida -match '^(\d{1,3}(\.\d{1,3}){3})') { return $Matches[1] }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $limite)
    return $null
}

$wsl = DireccionWsl
if (-not $wsl) { Fallar "WSL no responde: no pude leer su direccion (wsl hostname -I)." }

foreach ($puerto in $puertos) {
    # Se borra la regla anterior (apunta a la direccion vieja de WSL) y se crea de nuevo.
    netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$puerto 2>&1 | Out-Null
    netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$puerto connectaddress=$wsl connectport=$puerto 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fallar "No se pudo reenviar el puerto $puerto hacia $wsl." }
}
Anotar ("Puertos " + ($puertos -join ", ") + " reenviados hacia WSL ($wsl).") "Green"

if ($AbrirFirewall) {
    if (Get-NetFirewallRule -DisplayName "Puerto Nuevo" -ErrorAction SilentlyContinue) {
        Anotar "El firewall ya tenia la regla 'Puerto Nuevo'."
    } else {
        New-NetFirewallRule -DisplayName "Puerto Nuevo" -Direction Inbound -Protocol TCP -LocalPort $puertos -Action Allow | Out-Null
        Anotar ("Firewall: regla 'Puerto Nuevo' creada (entrada TCP " + ($puertos -join ", ") + ").") "Green"
    }
}

if ($Programar) {
    # Las distros de WSL son de cada usuario: la tarea corre con este mismo
    # usuario al iniciar su sesion, con permisos de administrador (netsh los pide).
    $accion = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" `
        -WorkingDirectory $PSScriptRoot
    $cuando = New-ScheduledTaskTrigger -AtLogOn -User $identidad.Name
    $quien = New-ScheduledTaskPrincipal -UserId $identidad.Name -LogonType Interactive -RunLevel Highest
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $cuando -Principal $quien `
        -Settings $ajustes -Force `
        -Description "Reenvia los puertos 8080 y 4001 de Windows hacia WSL. Registro en $registro" | Out-Null
    Anotar ("Tarea programada: se rehace cada vez que " + $identidad.Name + " inicie sesion.") "Green"
}
