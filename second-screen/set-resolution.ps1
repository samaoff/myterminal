param([string]$DeviceName,[int]$Width=1920,[int]$Height=1080,[switch]$Move,[int]$PositionX,[int]$PositionY)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class AlLadoResolution {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct Device {public int cb;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string description;public int flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string id;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string key;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct Mode {
 [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string name;
 public ushort spec,driver,size,extra;public uint fields;public int x,y;public uint orientation,fixedOutput;
 public short color,duplex,yResolution,ttOption,collate;
 [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string form;
 public ushort logPixels;public uint bits,width,height,flags,frequency,icmMethod,icmIntent,media,dither,reserved1,reserved2,panningWidth,panningHeight;
 }
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool EnumDisplayDevices(string name,uint index,ref Device device,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool EnumDisplaySettings(string name,int index,ref Mode mode);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int ChangeDisplaySettingsEx(string name,ref Mode mode,IntPtr hwnd,uint flags,IntPtr param);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="ChangeDisplaySettingsExW")]public static extern int ApplyAll(string name,IntPtr mode,IntPtr hwnd,uint flags,IntPtr param);
 public static Mode Current(string name){Mode m=new Mode();m.size=(ushort)Marshal.SizeOf(typeof(Mode));if(!EnumDisplaySettings(name,-1,ref m))throw new Exception("No se puede leer la pantalla");return m;}
 public static Device[] Devices(){var devices=new System.Collections.Generic.List<Device>();for(uint i=0;;i++){Device d=new Device();d.cb=Marshal.SizeOf(typeof(Device));if(!EnumDisplayDevices(null,i,ref d,0))break;devices.Add(d);}return devices.ToArray();}
 public static Mode[] Modes(string name){var modes=new System.Collections.Generic.List<Mode>();for(int i=0;;i++){Mode m=new Mode();m.size=(ushort)Marshal.SizeOf(typeof(Mode));if(!EnumDisplaySettings(name,i,ref m))break;if(m.bits>=32)modes.Add(m);}return modes.ToArray();}
 public static int Set(string name,uint width,uint height){Mode current=Current(name);return SetAt(name,width,height,current.x,current.y);}
 public static int SetAt(string name,uint width,uint height,int x,int y){
   var original=new System.Collections.Generic.Dictionary<string,Mode>();
   foreach(Device d in Devices())if((d.flags&1)!=0)original[d.name]=Current(d.name);
   Mode target=original[name];target.width=width;target.height=height;target.x=x;target.y=y;target.fields=0x180020;
   int result=ChangeDisplaySettingsEx(name,ref target,IntPtr.Zero,2,IntPtr.Zero);if(result!=0)return result;
   foreach(var entry in original){Mode mode=entry.Key==name?target:entry.Value;mode.fields=0x180020;result=ChangeDisplaySettingsEx(entry.Key,ref mode,IntPtr.Zero,0x10000001,IntPtr.Zero);if(result!=0)break;}
   if(result==0)result=ApplyAll(null,IntPtr.Zero,IntPtr.Zero,0,IntPtr.Zero);
   if(result!=0){foreach(var entry in original){Mode mode=entry.Value;mode.fields=0x180020;ChangeDisplaySettingsEx(entry.Key,ref mode,IntPtr.Zero,0x10000001,IntPtr.Zero);}ApplyAll(null,IntPtr.Zero,IntPtr.Zero,0,IntPtr.Zero);}
   return result;
 }
}
'@
$devices=@(foreach($device in [AlLadoResolution]::Devices()){
  if(($device.flags -band 1) -ne 0){$mode=[AlLadoResolution]::Current($device.name);$modes=@([AlLadoResolution]::Modes($device.name) | ForEach-Object {[pscustomobject]@{width=$_.width;height=$_.height}} | Sort-Object width,height -Unique);[pscustomobject]@{Device=$device.name;Description=$device.description;Width=$mode.width;Height=$mode.height;X=$mode.x;Y=$mode.y;Primary=(($device.flags -band 4) -ne 0);Modes=$modes}}
})
if(-not $DeviceName){ConvertTo-Json -InputObject $devices -Depth 5;exit 0}
$target=@($devices | Where-Object Device -eq $DeviceName)
if($target.Count -ne 1 -or $target[0].Description -notmatch 'Virtual Display|MttVDD|IddSample'){throw 'La pantalla elegida no se identifica como Virtual Display Driver. No se modifica.'}
if($target[0].Primary){throw 'No se cambia la resolucion de la pantalla principal.'}
if(@($target[0].Modes | Where-Object {$_.width -eq $Width -and $_.height -eq $Height}).Count -eq 0){throw 'El controlador no ofrece esta resolucion. Selecciona una de la lista.'}
$result=if($Move){[AlLadoResolution]::SetAt($DeviceName,$Width,$Height,$PositionX,$PositionY)}else{[AlLadoResolution]::Set($DeviceName,$Width,$Height)}
if($result -ne 0){throw "Windows ha rechazado la resolucion. Codigo: $result"}
$updated=[AlLadoResolution]::Current($DeviceName)
[pscustomobject]@{Device=$DeviceName;Width=$updated.width;Height=$updated.height} | ConvertTo-Json
