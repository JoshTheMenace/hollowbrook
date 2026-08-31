// Character registry. Each entry is a lazy import of a module exporting
// build() -> { root: THREE.Object3D, clips: THREE.AnimationClip[], meta }.
// Characters are authored in metres, feet at y=0, facing +Z.
export const characters = {
  brute: () => import('./brute.js'),
  ronin: () => import('./ronin.js'),
  elder: () => import('./elder.js'),
  mika: () => import('./mika.js'),
  fox: () => import('./fox.js'),
  archer: () => import('./archer.js'),
  mage: () => import('./mage.js'),
  golem: () => import('./golem.js'),
  knight: () => kaykit('Knight', { props: ['1H_Sword', 'Round_Shield'] }),
  barbarian: () => kaykit('Barbarian', { props: ['2H_Axe'], attack: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin'] }),
  wizard: () => kaykit('Mage', { props: ['2H_Staff'], attack: ['Spellcast_Shoot', 'Spellcast_Raise'] }),
  rogue: () => kaykit('Rogue', { props: ['Knife', 'Knife_Offhand'], attack: ['1H_Melee_Attack_Stab', 'Dualwield_Melee_Attack_Stab'] }),
  dummy: () => import('./dummy.js'),
};

async function kaykit(file, opts) {
  const { kaykitCharacter } = await import('./kaykit.js');
  return { build: kaykitCharacter(file, opts) };
}
