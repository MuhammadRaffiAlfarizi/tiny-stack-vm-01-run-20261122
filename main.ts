// Tiny stack VM: a faithful interpreter of make.fun's tiny stack ISA v1
// (kit: program/generator/subject/ISA.md; the reference VM is
// program/generator/subject/vm.mjs). Runs every instance in /input/<id>/
// (program.bin + input.bin) and writes /output/<id>/stdout.bin and
// /output/<id>/exit.txt. Node 22, no dependencies, deterministic.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STEP_LIMIT = 1000000;
const OUTPUT_MAX = 65536;

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const S = new Int32Array(256);
  let sp = 0;
  const R = new Int32Array(64);
  let rp = 0;
  const M = new Int32Array(256);
  const O = new Uint8Array(OUTPUT_MAX);
  let ol = 0;
  let pc = 0;
  let ip = 0;
  let steps = 0;
  const n = p.length;
  const end = (code: number) => ({ out: O.slice(0, ol), code });
  for (;;) {
    if (steps === STEP_LIMIT) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    let imm = 0;
    let pops = 0;
    let pushes = 0;
    if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
      pops = 2;
      pushes = 1;
    } else if (op === 0x17 || op === 0x1b) {
      pops = 1;
      pushes = 1;
    } else {
      switch (op) {
        case 0x00: break; // HALT
        case 0x01: imm = 1; pushes = 1; break; // PUSH8
        case 0x02: imm = 4; pushes = 1; break; // PUSH32
        case 0x03: pops = 1; break; // POP
        case 0x04: pops = 1; pushes = 2; break; // DUP
        case 0x05: pops = 2; pushes = 2; break; // SWAP
        case 0x06: pops = 2; pushes = 3; break; // OVER
        case 0x07: pops = 3; pushes = 3; break; // ROT
        case 0x30: imm = 2; break; // JMP
        case 0x31: imm = 2; pops = 1; break; // JZ
        case 0x32: imm = 2; pops = 1; break; // JNZ
        case 0x33: imm = 2; break; // CALL
        case 0x34: break; // RET
        case 0x40: pops = 1; pushes = 1; break; // LOAD
        case 0x41: pops = 2; break; // STORE
        case 0x50: pops = 1; break; // PRINT
        case 0x51: pops = 1; break; // PUTC
        case 0x52: pushes = 1; break; // IN
        case 0x53: pops = 1; break; // EXIT
        default: return end(5);
      }
    }
    if (pc + imm >= n) return end(9);
    steps++;
    const next = pc + 1 + imm;
    // Fast path for the two hottest opcodes (HALT ends every program,
    // PUSH8 loads nearly every literal): their traps were already
    // checked above, so the generic stack checks and switch are redundant.
    if (op === 0x00) return end(0); // HALT
    if (op === 0x01) { // PUSH8
      if (sp + 1 > 256) return end(3);
      S[sp++] = (p[next - 1] << 24) >> 24;
      pc = next;
      continue;
    }
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = next;
    if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
      const b = S[sp - 1];
      const a = S[sp - 2];
      let r = 0;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) {
        if (b === 0) return end(4);
        r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      } else if (op === 0x14) {
        if (b === 0) return end(4);
        r = b === -1 ? 0 : (a % b) | 0;
      } else if (op === 0x15) {
        if (b === 0) return end(4);
        r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      } else if (op === 0x16) {
        if (b === 0) return end(4);
        r = ((a >>> 0) % (b >>> 0)) | 0;
      } else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // 0x22 LTU
      sp -= 2;
      S[sp++] = r;
      continue;
    }
    switch (op) {
      case 0x00: return end(0);
      case 0x01: S[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02: S[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: S[sp] = S[sp - 1]; sp++; break;
      case 0x05: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; }
      case 0x06: S[sp] = S[sp - 2]; sp++; break;
      case 0x07: { const a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break; }
      case 0x17: S[sp - 1] = (-S[sp - 1]) | 0; break;
      case 0x1b: S[sp - 1] = ~S[sp - 1]; break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) {
          const v = S[--sp];
          take = op === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (rp === 64) return end(7);
        R[rp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (rp === 0) return end(8);
        pc = R[--rp];
        break;
      case 0x40: {
        const addr = S[sp - 1];
        if (addr < 0 || addr >= 256) return end(6);
        S[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = S[sp - 1];
        const v = S[sp - 2];
        if (addr < 0 || addr >= 256) return end(6);
        sp -= 2;
        M[addr] = v;
        break;
      }
      case 0x50: {
        const s = String(S[sp - 1]);
        if (ol + s.length > OUTPUT_MAX) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) O[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > OUTPUT_MAX) return end(11);
        O[ol++] = S[--sp] & 255;
        break;
      case 0x52:
        S[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        return end(S[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
