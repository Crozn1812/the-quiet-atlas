$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$operationMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$actionMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1
function Await-Operation($Operation, $ResultType) {
  $task = $operationMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.GetAwaiter().GetResult()
}
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cvPath = Join-Path $repoRoot 'out/cv'
$previewPath = Join-Path $cvPath 'previews'
$null = New-Item -ItemType Directory -Force -Path $previewPath
$folder = Await-Operation ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($previewPath)) ([Windows.Storage.StorageFolder])
foreach ($pdfFile in Get-ChildItem -LiteralPath $cvPath -Filter '*.pdf') {
  $file = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfFile.FullName)) ([Windows.Storage.StorageFile])
  $pdf = Await-Operation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  for ($index = 0; $index -lt $pdf.PageCount; $index++) {
    $page = $pdf.GetPage($index)
    $target = Await-Operation ($folder.CreateFileAsync($pdfFile.BaseName + '-' + ($index + 1) + '.png', 1)) ([Windows.Storage.StorageFile])
    $stream = Await-Operation ($target.OpenAsync(1)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
      $task = $actionMethod.Invoke($null, @($page.RenderToStreamAsync($stream)))
      $null = $task.GetAwaiter().GetResult()
      Write-Output $target.Path
    } finally {
      $stream.Dispose()
      $page.Dispose()
    }
  }
}
