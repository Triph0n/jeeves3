$base = "C:\Users\Vladimir\Desktop\Baxter"
$folders = @(
    $base,
    (Join-Path $base "Hotovo"),
    (Join-Path $base "Chyba"),
    (Join-Path $base "Config")
)

foreach ($folder in $folders) {
    if (-not (Test-Path -LiteralPath $folder)) {
        New-Item -ItemType Directory -Path $folder | Out-Null
    }
}

Write-Host "Baxter folders are ready at $base"
