import { Mobius, } from 'graphql-mobius';
import { programQueries, programSchema } from './types/programs';
import { studentQueries, studentSchema } from './types/students';
import { milestoneQueries, milestoneSchema } from './types/milestones';
import { voteQueries, voteSchema } from './types/votes';

const typeDefs = `
  ${programSchema}
  ${studentSchema}
  ${milestoneSchema}
  ${voteSchema}

  
  type Query {
    ${studentQueries}
    ${voteQueries}
    ${milestoneQueries}
    ${programQueries}
  }
` as const;

// GraphQL is served directly by Ponder (the indexer), not by the REST backend.
export const mobius = new Mobius<typeof typeDefs>({
  url: `${import.meta.env.VITE_INDEXER_HOST}/graphql`,
  typeDefs,
});