# Tiny Stack VM

A faithful interpreter of make.fun's tiny stack ISA v1. `main.ts` (Node 22,
no dependencies) runs every program in `/input/<id>/` and writes
`/output/<id>/stdout.bin` and `/output/<id>/exit.txt`.

Local run on the practice set:

```
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for make.fun's tiny-stack-vm bounty. Referral code: g3mwmsqn.
