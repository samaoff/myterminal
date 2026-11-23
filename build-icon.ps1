Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $PSScriptRoot 'build'
[System.IO.Directory]::CreateDirectory($iconDir) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(23,27,36))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(162,235,196)),18
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($pen,64,74,110,120)
$graphics.DrawLine($pen,110,120,64,166)
$graphics.DrawLine($pen,137,169,193,169)
$bitmap.Save((Join-Path $iconDir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
$png = $stream.ToArray()
$output = [System.IO.File]::Create((Join-Path $iconDir 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter $output
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$png.Length); $writer.Write([UInt32]22); $writer.Write($png)
$writer.Dispose(); $stream.Dispose(); $graphics.Dispose(); $pen.Dispose(); $bitmap.Dispose()
