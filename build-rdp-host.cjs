const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
function buildRdpHost() {
  if(process.platform!=='win32')throw new Error('El escritorio RDP integrado requiere Windows.');
  const source=path.join(__dirname,'native','rdp-host.cs');
  // A new build must not overwrite the executable used by an active desktop.
  const version=createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,16);
  const output=path.join(__dirname,'native','rdp-host-'+version+'.exe');
  if(fs.existsSync(output))return output;
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:Microsoft.CSharp.dll','/r:System.Web.Extensions.dll','/out:'+output,source],{windowsHide:true,stdio:'pipe'});
  return output;
}
if(require.main===module){try{console.log(buildRdpHost());}catch(error){console.error(error.stdout?.toString()||error.message);process.exitCode=1;}}
module.exports={buildRdpHost};
