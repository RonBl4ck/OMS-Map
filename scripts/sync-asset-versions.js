const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const LOCAL_ASSET_ATTR_REGEX = /((?:href|src)=["'])(assets\/(?:css|js)\/[^"'?#]+\.(?:css|js))(?:\?v=([^"'#]*))?(["'])/gi;

function computeFileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function syncHtmlAssetVersions(html, rootDir = DEFAULT_ROOT) {
    const updated = [];
    const unchanged = [];
    const missing = [];

    const nextHtml = html.replace(LOCAL_ASSET_ATTR_REGEX, (match, prefix, assetRelPath, currentVersion, suffix) => {
        const fullPath = path.join(rootDir, assetRelPath);
        if (!fs.existsSync(fullPath)) {
            missing.push(assetRelPath);
            return match;
        }
        const expectedVersion = computeFileHash(fullPath);
        if (currentVersion === expectedVersion) {
            unchanged.push(assetRelPath);
            return match;
        }
        updated.push({
            asset: assetRelPath,
            from: currentVersion || null,
            to: expectedVersion
        });
        return `${prefix}${assetRelPath}?v=${expectedVersion}${suffix}`;
    });

    return { html: nextHtml, updated, unchanged, missing };
}

function syncIndexHtmlVersions({ rootDir = DEFAULT_ROOT, checkOnly = false } = {}) {
    const indexPath = path.join(rootDir, 'index.html');
    const currentHtml = fs.readFileSync(indexPath, 'utf8');
    const result = syncHtmlAssetVersions(currentHtml, rootDir);

    if (result.missing.length > 0) {
        throw new Error(`Assets referenciados en index.html no encontrados: ${result.missing.join(', ')}`);
    }

    const changed = result.updated.length > 0;
    if (changed && !checkOnly) {
        fs.writeFileSync(indexPath, result.html, 'utf8');
    }

    return { changed, ...result };
}

if (require.main === module) {
    const checkOnly = process.argv.includes('--check');
    try {
        const result = syncIndexHtmlVersions({ checkOnly });
        if (checkOnly && result.changed) {
            console.error('[Asset Versions] Desincronizados en index.html:');
            for (const item of result.updated) {
                console.error(`  - ${item.asset}: ${item.from || '(sin ?v=)'} -> ${item.to}`);
            }
            process.exit(1);
        }
        if (result.changed) {
            console.log(`[Asset Versions] Actualizados ${result.updated.length} asset(s) en index.html:`);
            for (const item of result.updated) {
                console.log(`  - ${item.asset}: ${item.from || '(sin ?v=)'} -> ${item.to}`);
            }
        } else {
            console.log(`[Asset Versions] OK (${result.unchanged.length} assets sincronizados).`);
        }
    } catch (err) {
        console.error('[Asset Versions Error]', err.message);
        process.exit(1);
    }
}

module.exports = { computeFileHash, syncHtmlAssetVersions, syncIndexHtmlVersions };
