const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  // 检查源目录是否存在
  if (!fs.existsSync(src)) {
    console.log(`Source directory ${src} does not exist, skipping copy...`);
    return;
  }

  // 创建目标目录
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // 读取源目录
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 尝试从上级目录复制
// __dirname 是 backend/scripts，所以需要往上两级到项目根目录
const sharedSrc = path.join(__dirname, '..', '..', 'shared');
const sharedDest = path.join(__dirname, '..', 'shared');

console.log('Copying shared directory...');
console.log('From:', sharedSrc);
console.log('To:', sharedDest);

copyDir(sharedSrc, sharedDest);

console.log('Done!');
