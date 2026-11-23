$ErrorActionPreference = 'Stop'
try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if (-not $env:AI_TERMINAL_USAGE_FILE -or $payload.session_id -ne $env:AI_TERMINAL_CLAUDE_SESSION) { exit 0 }
    # Store numeric usage only: no prompts, messages, credentials or transcript paths.
    $safe = @{
        session_id = $payload.session_id
        model = $payload.model.display_name
        context_window = @{ remaining_percentage = $payload.context_window.remaining_percentage }
        rate_limits = @{}
    }
    foreach ($key in @('five_hour', 'seven_day', 'spend_limit')) {
        $window = $payload.rate_limits.$key
        if ($null -ne $window) { $safe.rate_limits[$key] = @{ used_percentage = $window.used_percentage; resets_at = $window.resets_at } }
    }
    $temp = $env:AI_TERMINAL_USAGE_FILE + '.tmp-' + $PID
    [IO.File]::WriteAllText($temp, ($safe | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $env:AI_TERMINAL_USAGE_FILE -Force
    $model = $payload.model.display_name
    $remaining = $payload.context_window.remaining_percentage
    if ($null -ne $remaining) { [Console]::Write("$model | Contexto restante: $remaining%") }
    else { [Console]::Write("$model | Uso en MyTerminal") }
} catch { exit 0 }
