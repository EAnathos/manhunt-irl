# Contribuer à ManHunt IRL

## Branches

| Branche | Rôle |
|---------|------|
| `main` | Code stable, déployé en production |
| `dev` | Intégration des features en cours |
| `feat/<slug>` | Une feature ou un correctif isolé |

### Workflow

1. Créer une branche `feat/<slug>` depuis `dev`
2. Développer, commiter, pousser
3. Ouvrir une Pull Request vers `dev`
4. Après review et CI verte, merger dans `dev`
5. `dev` → `main` uniquement quand stable et testée

**Aucun commit direct sur `main`.** Tout passe par `dev` via PR.

## Messages de commit

Convention [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat: ajouter l'attribution aléatoire des rôles
fix: corriger le calcul de distance hors zone
chore: mettre à jour les dépendances
docs: documenter le déploiement Nginx
refactor: extraire la logique de broadcast
test: ajouter les tests d'élimination
```

Format : `<type>: <description courte en minuscules>`

- **feat** — nouvelle fonctionnalité
- **fix** — correction de bug
- **chore** — maintenance, dépendances, config
- **docs** — documentation uniquement
- **refactor** — restructuration sans changement de comportement
- **test** — ajout ou modification de tests

## CI

GitHub Actions exécute automatiquement sur chaque push `dev` et PR vers `dev`/`main` :

```
npm run lint
npm run typecheck
npm run test
```

La PR ne peut pas être mergée si la CI échoue.

## Avant de soumettre une PR

```bash
# Vérifier que tout passe en local
npm run lint
npm run typecheck
npm run test
```

### Checklist

- [ ] Le code compile sans erreur (`npm run typecheck`)
- [ ] Les tests passent (`npm run test`)
- [ ] Les types partagés sont à jour dans `packages/types/`
- [ ] Le titre de la PR suit la convention Conventional Commits
- [ ] La description de la PR explique le **pourquoi**, pas le **quoi**

## Structure du code

```
packages/types/     → Interfaces TypeScript partagées (modifier ici en premier)
apps/backend/src/   → Serveur Fastify
  ├── routes/       → Handlers HTTP et WebSocket
  ├── engine.ts     → Logique de jeu (timers, éliminations, fin de partie)
  ├── broadcast.ts  → Diffusion WebSocket ciblée
  ├── geo.ts        → Calculs géographiques
  ├── store.ts      → État en mémoire (Map)
  └── snapshot.ts   → Sérialisation de l'état pour le client
apps/frontend/src/  → PWA SvelteKit
  ├── lib/api/      → Client HTTP et WebSocket
  ├── lib/stores/   → État réactif (Svelte 5 runes)
  └── routes/       → Pages (accueil, lobby/jeu, règles)
```

## Conventions

- TypeScript **strict** partout
- Termes de jeu en français dans les types (`CHASSEUR`, `PROIE`, `ELIMINE`)
- Identifiants de code en anglais (`player`, `game`, `broadcast`)
- Pas de commentaires sauf quand le *pourquoi* est non évident
- Pas d'abstraction prématurée — trois lignes copiées valent mieux qu'un helper fragile

## Déploiement

Le déploiement en production est déclenché **manuellement** depuis `main` (ou via un tag `v*`). Pas de CD automatique sur push.

Voir le [README](README.md) pour les instructions de déploiement.
