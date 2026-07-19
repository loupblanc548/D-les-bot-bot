# Politique de confidentialité (RGPD)

## Données collectées

Le bot collecte les données suivantes pour fonctionner :

| Catégorie | Données | Finalité | Base légale |
|-----------|---------|----------|-------------|
| Mémoire de conversation | Faits, messages, embeddings | Personnalisation des réponses de l'agent IA | Consentement (Art. 6(1)(a)) |
| Préférences | Jeux, plateformes, notifications | Personnalisation des alertes | Consentement (Art. 6(1)(a)) |
| Profils liés | Steam ID, Minecraft gamertag | Fonctionnalités gaming | Consentement (Art. 6(1)(a)) |
| Historique | Pseudos, avatars, commandes, activité | Modération et analytics | Intérêt légitime (Art. 6(1)(f)) |
| Chat & traduction | Messages, traductions | Fonctionnalité de chat IA | Consentement (Art. 6(1)(a)) |
| Profil de risque | Score de risque, alertes | Sécurité du serveur | Intérêt légitime (Art. 6(1)(f)) |
| Modération | Sanctions, actions de modération | Sécurité du serveur | Intérêt légitime (Art. 6(1)(f)) |

## Durée de conservation

- **Mémoire de conversation** : 12 mois sans interaction (purge automatique hebdomadaire)
- **Logs de modération** : conservés tant que le serveur est actif (intérêt légitime de sécurité)
- **Autres données** : supprimées sur demande via `/privacy forget-me`

## Vos droits

| Droit | Commande | Description |
|-------|----------|-------------|
| Droit à l'effacement | `/privacy forget-me` | Supprime toutes vos données personnelles |
| Droit d'accès | `/privacy export-me` | Exporte toutes vos données en JSON (DM) |
| Information | `/privacy info` | Affiche quelles données sont stockées |

### Exceptions

Les **sanctions et actions de modération** sont conservées pour la sécurité du serveur (RGPD Art. 6(1)(f) — intérêt légitime). Elles ne sont pas supprimées par `/privacy forget-me` mais sont incluses dans l'export `/privacy export-me`.

## Comment demander la suppression

1. Tapez `/privacy forget-me` sur le serveur
2. Un aperçu des données à supprimer s'affiche
3. Confirmez avec le bouton rouge (60 secondes pour confirmer)
4. La suppression est exécutée et loguée pour preuve de conformité

## Contact

Pour toute question relative à vos données personnelles, contactez l'administrateur du serveur.

---

*Bot opéré depuis la France — conformité RGPD (Règlement Général sur la Protection des Données).*
