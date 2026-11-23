# Configure only this process; keep the user's PowerShell profile untouched.
try {
    if ($env:AI_TERMINAL_PSREADLINE -and (Test-Path -LiteralPath $env:AI_TERMINAL_PSREADLINE)) {
        Import-Module $env:AI_TERMINAL_PSREADLINE -Global -ErrorAction Stop
    } else { Import-Module PSReadLine -Global -ErrorAction Stop }
    if ($env:AI_TERMINAL_HISTORY) { Set-PSReadLineOption -HistorySavePath $env:AI_TERMINAL_HISTORY -HistorySaveStyle SaveIncrementally }
    Set-PSReadLineOption -HistorySearchCursorMovesToEnd -ErrorAction Stop
    Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
    Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
    Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
    Set-PSReadLineKeyHandler -Key Ctrl+r -Function ReverseSearchHistory
    if ((Get-Command Set-PSReadLineOption).Parameters.ContainsKey('PredictionSource')) {
        Set-PSReadLineOption -PredictionSource History
        Set-PSReadLineKeyHandler -Key RightArrow -Function ForwardChar
        Write-Host 'Historial: Ctrl+R para buscar, Tab para completar y flecha derecha para aceptar sugerencias.' -ForegroundColor DarkGray
    } else {
        Write-Host 'Historial: Ctrl+R para buscar, flechas para filtrar y Tab para completar. Las sugerencias al escribir requieren PSReadLine 2.1 o superior.' -ForegroundColor DarkGray
    }
} catch {
    Write-Host 'No se pudo activar el historial enriquecido de PSReadLine. El shell sigue disponible.' -ForegroundColor DarkGray
}
