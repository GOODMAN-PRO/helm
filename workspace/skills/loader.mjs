import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = __dirname;


const skillsCache = new Map();
let cacheReady = false;


async function loadSkills() {
  if (cacheReady && skillsCache.size > 0) return Array.from(skillsCache.values());

  skillsCache.clear();
  const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.mjs') && f !== 'loader.mjs');

  for (const file of files) {
    const name = file.slice(0, -4);
    try {
      const mod = await import(`./${file}`);
      if (mod.execute && typeof mod.execute === 'function') {
        skillsCache.set(name, {
          name,
          description: mod.description || 'No description provided',
          execute: mod.execute,
        });
      }
    } catch (e) {
      console.error(`[skills] Failed to load ${file}:`, e.message);
    }
  }

  cacheReady = true;
  return Array.from(skillsCache.values());
}


export async function listSkills() {
  const skills = await loadSkills();
  return skills.map(s => ({
    name: s.name,
    description: s.description,
  }));
}


export async function runSkillCommand(name, argsStr = '') {
  const skills = await loadSkills();
  const skill = skillsCache.get(name);

  if (!skill) {
    return `Skill "${name}" not found. Available: ${Array.from(skillsCache.keys()).join(', ') || '(none)'}`;
  }

  try {
    const result = await skill.execute(argsStr);
    return result;
  } catch (e) {
    return `Skill "${name}" error: ${e.message}`;
  }
}


export async function listSkillNames() {
  const skills = await loadSkills();
  return skills.map(s => s.name);
}
