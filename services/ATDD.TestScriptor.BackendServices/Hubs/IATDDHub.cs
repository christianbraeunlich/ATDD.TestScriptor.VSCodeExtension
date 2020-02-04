﻿using ATDD.TestScriptor.Library;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace ATDD.TestScriptor.BackendServices.Hubs
{
    public interface IATDDHub
    {
        Task GetProjects(IEnumerable<ALProject> msg);
        Task GetObjects(IEnumerable<CollectorItem> msg);
    }
}