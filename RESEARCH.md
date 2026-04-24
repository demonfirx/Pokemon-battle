# Pokemon Battle — Research Notes 🎮

## Sources
- PokeAPI (https://pokeapi.co) — official REST API
- PokemonDB (https://pokemondb.net) — stats, moves, type chart
- Gen 6+ type chart (current standard)

---

## 1. ACCURATE BASE STATS (Level 50, from PokemonDB)

### Pikachu (#025) — Electric
| Stat | Base | Min (Lv100) | Max (Lv100) |
|------|------|-------------|-------------|
| HP | 35 | 180 | 274 |
| Attack | 55 | 103 | 229 |
| Defense | 40 | 76 | 196 |
| Sp.Atk | 50 | 94 | 218 |
| Sp.Def | 50 | 94 | 218 |
| Speed | 90 | 166 | 306 |
| **Total** | **320** | | |

### Charizard (#006) — Fire/Flying
| Stat | Base | Min | Max |
|------|------|-----|-----|
| HP | 78 | 266 | 360 |
| Attack | 84 | 155 | 293 |
| Defense | 78 | 144 | 280 |
| Sp.Atk | 109 | 200 | 348 |
| Sp.Def | 85 | 157 | 295 |
| Speed | 100 | 184 | 328 |
| **Total** | **534** | | |

### Blastoise (#009) — Water
| Stat | Base |
|------|------|
| HP | 79 |
| Attack | 83 |
| Defense | 100 |
| Sp.Atk | 85 |
| Sp.Def | 105 |
| Speed | 78 |
| **Total** | **530** |

### Venusaur (#003) — Grass/Poison
| Stat | Base |
|------|------|
| HP | 80 |
| Attack | 82 |
| Defense | 83 |
| Sp.Atk | 100 |
| Sp.Def | 100 |
| Speed | 80 |
| **Total** | **525** |

### Gengar (#094) — Ghost/Poison
| Stat | Base |
|------|------|
| HP | 60 |
| Attack | 65 |
| Defense | 60 |
| Sp.Atk | 130 |
| Sp.Def | 75 |
| Speed | 110 |
| **Total** | **500** |

### Snorlax (#143) — Normal
| Stat | Base |
|------|------|
| HP | 160 |
| Attack | 110 |
| Defense | 65 |
| Sp.Atk | 65 |
| Sp.Def | 110 |
| Speed | 30 |
| **Total** | **540** |

---

## 2. DUAL TYPES (our game currently only uses primary type!)

| Pokemon | Type 1 | Type 2 | Impact |
|---------|--------|--------|--------|
| Pikachu | Electric | — | Single type ✅ |
| Charizard | Fire | **Flying** | ⚠️ 4x weak to Rock, immune to Ground, weak to Electric |
| Blastoise | Water | — | Single type ✅ |
| Venusaur | Grass | **Poison** | ⚠️ Weak to Psychic, resists Fighting/Fairy |
| Gengar | Ghost | **Poison** | ⚠️ Weak to Ground/Psychic, immune to Normal/Fighting |
| Snorlax | Normal | — | Single type ✅ |

---

## 3. FULL TYPE CHART (Gen 6+, 18 types)

### Super Effective (2x) — Attacking type → Defending type
| Attacking | Super effective against |
|-----------|----------------------|
| Normal | — |
| Fire | Grass, Ice, Bug, Steel |
| Water | Fire, Ground, Rock |
| Electric | Water, Flying |
| Grass | Water, Ground, Rock |
| Ice | Grass, Ground, Flying, Dragon |
| Fighting | Normal, Ice, Rock, Dark, Steel |
| Poison | Grass, Fairy |
| Ground | Fire, Electric, Poison, Rock, Steel |
| Flying | Grass, Fighting, Bug |
| Psychic | Fighting, Poison |
| Bug | Grass, Psychic, Dark |
| Rock | Fire, Ice, Flying, Bug |
| Ghost | Ghost, Psychic |
| Dragon | Dragon |
| Dark | Ghost, Psychic |
| Steel | Ice, Rock, Fairy |
| Fairy | Fighting, Dragon, Dark |

### Not Very Effective (0.5x)
| Attacking | Not very effective against |
|-----------|--------------------------|
| Normal | Rock, Steel |
| Fire | Fire, Water, Rock, Dragon |
| Water | Water, Grass, Dragon |
| Electric | Electric, Grass, Dragon |
| Grass | Fire, Grass, Poison, Flying, Bug, Dragon, Steel |
| Ice | Fire, Water, Ice, Steel |
| Fighting | Poison, Flying, Psychic, Bug, Fairy |
| Poison | Poison, Ground, Rock, Ghost |
| Ground | Grass, Bug |
| Flying | Electric, Rock, Steel |
| Psychic | Psychic, Steel |
| Bug | Fire, Fighting, Poison, Flying, Ghost, Steel, Fairy |
| Rock | Fighting, Ground, Steel |
| Ghost | Dark |
| Dragon | Steel |
| Dark | Fighting, Dark, Fairy |
| Steel | Fire, Water, Electric, Steel |
| Fairy | Fire, Poison, Steel |

### Immune (0x)
| Attacking | No effect on |
|-----------|-------------|
| Normal | Ghost |
| Electric | Ground |
| Fighting | Ghost |
| Poison | Steel |
| Ground | Flying |
| Psychic | Dark |
| Ghost | Normal |
| Dragon | Fairy |

---

## 4. DAMAGE FORMULA (Gen V+)

```
Damage = ((2 * Level / 5 + 2) * Power * A/D) / 50 + 2) * Modifier

Modifier = STAB * Type * Critical * Random * Other

Where:
- STAB = 1.5 if move type matches attacker type, else 1.0
- Type = type effectiveness (0, 0.25, 0.5, 1, 2, 4)
- Critical = 1.5 (Gen VI+), chance ~6.25% (stage 0)
- Random = uniform random [0.85, 1.00]
- A = Attack or Sp.Atk (depending on move category)
- D = Defense or Sp.Def (depending on move category)
```

### Physical vs Special
- **Physical moves**: use Attack vs Defense
- **Special moves**: use Sp.Atk vs Sp.Def
- **Status moves**: no damage, apply effects

### STAB (Same Type Attack Bonus)
If the move's type matches one of the attacker's types → 1.5x damage
Example: Charizard (Fire/Flying) using Flamethrower (Fire) = 1.5x

### Critical Hits
- Base rate: 1/24 (~4.17%)
- Stage +1: 1/8 (12.5%)
- Stage +2: 1/2 (50%)
- Stage +3+: always crits
- Damage multiplier: 1.5x (Gen VI+)

---

## 5. STATUS CONDITIONS

### Non-volatile (only 1 at a time)
| Status | Effect | Icon |
|--------|--------|------|
| **Burn** (BRN) | Halves Attack, loses 1/16 HP per turn | 🔥 |
| **Paralysis** (PAR) | Speed quartered, 25% chance can't move | ⚡ |
| **Poison** (PSN) | Loses 1/8 HP per turn | ☠️ |
| **Bad Poison** (TOX) | Loses increasing HP (1/16, 2/16, 3/16...) | ☠️☠️ |
| **Sleep** (SLP) | Can't move for 1-3 turns | 💤 |
| **Freeze** (FRZ) | Can't move, 20% thaw chance per turn | ❄️ |

### Volatile (can stack)
| Status | Effect |
|--------|--------|
| **Confusion** | 33% chance hits self for 40 power |
| **Flinch** | Can't move this turn (from moves like Bite) |
| **Infatuation** | 50% chance can't move |

---

## 6. MOVE CATEGORIES & KEY MOVES

### Physical Moves (use Attack/Defense)
- Thunderbolt → actually **Special** in real games!
- Quick Attack, Iron Tail, Dragon Claw, Bite, Body Slam, Earthquake, Ice Punch, Crunch

### Special Moves (use Sp.Atk/Sp.Def)
- Thunderbolt, Flamethrower, Hydro Pump, Solar Beam, Shadow Ball, Ice Beam, Dark Pulse, Sludge Bomb, Air Slash, Water Pulse, Electro Ball, Fire Punch (actually Physical!)

### Correct categories for our moves:
| Move | Type | Category | Power | Acc | PP |
|------|------|----------|-------|-----|-----|
| Thunderbolt | Electric | Special | 90 | 100 | 15 |
| Quick Attack | Normal | Physical | 40 | 100 | 30 |
| Iron Tail | Steel | Physical | 100 | 75 | 15 |
| Flamethrower | Fire | Special | 90 | 100 | 15 |
| Air Slash | Flying | Special | 75 | 95 | 15 |
| Dragon Claw | Dragon | Physical | 80 | 100 | 15 |
| Hydro Pump | Water | Special | 110 | 80 | 5 |
| Ice Beam | Ice | Special | 90 | 100 | 10 |
| Bite | Dark | Physical | 60 | 100 | 25 |
| Solar Beam | Grass | Special | 120 | 100 | 10 |
| Sludge Bomb | Poison | Special | 90 | 100 | 10 |
| Razor Leaf | Grass | Physical | 55 | 95 | 25 |
| Shadow Ball | Ghost | Special | 80 | 100 | 15 |
| Dark Pulse | Dark | Special | 80 | 100 | 15 |
| Body Slam | Normal | Physical | 85 | 100 | 15 |
| Earthquake | Ground | Physical | 100 | 100 | 10 |
| Ice Punch | Ice | Physical | 75 | 100 | 15 |
| Crunch | Dark | Physical | 80 | 100 | 15 |

---

## 7. SPRITE ASSETS

### PokeAPI Sprites
- Front: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png`
- Back: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/{id}.png`
- Shiny front: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/{id}.png`
- Animated: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{id}.gif`
- Official artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png`

### Pokemon IDs
| Pokemon | ID |
|---------|-----|
| Venusaur | 3 |
| Charizard | 6 |
| Blastoise | 9 |
| Pikachu | 25 |
| Gengar | 94 |
| Snorlax | 143 |

### Type Icons/Colors
| Type | Color |
|------|-------|
| Normal | #A8A878 |
| Fire | #F08030 |
| Water | #6890F0 |
| Electric | #F8D030 |
| Grass | #78C850 |
| Ice | #98D8D8 |
| Fighting | #C03028 |
| Poison | #A040A0 |
| Ground | #E0C068 |
| Flying | #A890F0 |
| Psychic | #F85888 |
| Bug | #A8B820 |
| Rock | #B8A038 |
| Ghost | #705898 |
| Dragon | #7038F8 |
| Dark | #705848 |
| Steel | #B8B8D0 |
| Fairy | #EE99AC |

---

## 8. WHAT OUR GAME IS MISSING vs REAL POKEMON

### Critical gaps:
1. **Dual types** — Charizard should be Fire/Flying, Venusaur Grass/Poison, Gengar Ghost/Poison
2. **Physical/Special split** — all our moves use Attack/Defense, should split
3. **STAB bonus** — not implemented (1.5x when move type = pokemon type)
4. **Status conditions** — Burn, Paralysis, Poison, Sleep, Freeze, Confusion
5. **Critical hits** — not implemented
6. **Move secondary effects** — Body Slam 30% paralyze, Ice Beam 10% freeze, etc.

### Nice to have:
7. **Abilities** — Static, Blaze, Torrent, Overgrow, etc.
8. **Items** — held items
9. **Weather** — Sunny Day, Rain Dance
10. **Priority moves** — Quick Attack goes first regardless of speed
11. **Multi-hit moves**
12. **Recoil moves**
13. **PP system** (backend-side)
