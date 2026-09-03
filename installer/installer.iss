; =====================================================================
; Lipi AI — Inno Setup Script
; Generates a professional Windows Setup.exe Installer
; =====================================================================

#define MyAppName "Lipi AI"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "Lipi AI"
#define MyAppURL "https://github.com/VAbhijith2003github/Lipi-AI"
#define MyAppExeName "LipiAI.exe"

[Setup]
AppId={{C8E11082-A745-42DE-8C39-166D57F73961}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Allow user to choose custom installation location
DefaultDirName={autopf}\{#MyAppName}
DisableDirPage=no

DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no

; Output configuration
SetupIconFile=..\icon.ico
OutputDir=..\dist_installer
OutputBaseFilename=Lipi-AI-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Permissions & Privileges
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Visual style
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "configure_ollama"; Description: "Verify Ollama and Download Local AI Models (gemma2:2b & nomic-embed-text)"; GroupDescription: "AI Setup:"; Flags: checkedonce

[Files]
; All files from the built Electron + FastAPI package
Source: "..\frontend\dist-electron\LipiAI-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Ollama setup helper script
Source: "setup_ollama.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Open With List registration
Root: HKA; Subkey: "Software\Classes\.pdf\OpenWithList\{#MyAppExeName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\{#MyAppExeName}\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletevalue

; Explorer Context Menu item ("Open with Lipi AI" on right-click)
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\.pdf\shell\OpenWithLipiAI"; ValueType: string; ValueData: "Open with Lipi AI"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\SystemFileAssociations\.pdf\shell\OpenWithLipiAI\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletevalue


[Run]
; Run the Ollama & Model downloader if the task is checked
Filename: "{app}\setup_ollama.bat"; Description: "Configuring Ollama and AI Models..."; StatusMsg: "Checking Ollama and downloading models..."; Flags: waituntilterminated; Tasks: configure_ollama

; Option to launch Lipi AI when installation finishes
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
